import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  Search,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Utensils,
  EyeOff,
  Plus,
  RefreshCw,
  XCircle,
  X,
  DollarSign,
  Check,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import OrganizationSearchSelect from "../components/OrganizationSearchSelect";
import {
  mealService,
  type Meal,
  type MealFormData,
} from "../services/mealService";
import { categoryService, type Category } from "../services/categoryService";
import { addonService, type Addon } from "../services/addonService";
import { declarationService, type Declaration } from "../services/declarationService";
import { optionalIngredientService, type OptionalIngredient } from "../services/optionalIngredientService";
import { formatPrice } from "../utils/currency";
import ImageUpload from "../components/ImageUpload";
import branchService, { type Branch } from "../services/branchService";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const MealManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny } = usePermissions();
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [optionalIngredients, setOptionalIngredients] = useState<OptionalIngredient[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuItemsLoading, setMenuItemsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "listOrder">("listOrder");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [showDropdownMenu, setShowDropdownMenu] = useState<string | null>(null);
  const [addonSearchTerm, setAddonSearchTerm] = useState("");
  const [showEditAddons, setShowEditAddons] = useState(false);
  const [filterAddonsByCategory, setFilterAddonsByCategory] = useState(false);
  const [declarationSearchTerm, setDeclarationSearchTerm] = useState("");
  const [showEditDeclarations, setShowEditDeclarations] = useState(false);
  const [optionalIngredientSearchTerm, setOptionalIngredientSearchTerm] = useState("");
  const [showEditOptionalIngredients, setShowEditOptionalIngredients] = useState(false);
  const [basePriceInput, setBasePriceInput] = useState<string>("");
  const [sizePriceInputs, setSizePriceInputs] = useState<Record<number, string>>({});
  const [orgVersion, setOrgVersion] = useState(0);
  const [branchPrices, setBranchPrices] = useState<
    Array<{
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
    }>
  >([]);
  const [loadingBranchPrices, setLoadingBranchPrices] = useState(false);
  const [editingBranchPrice, setEditingBranchPrice] = useState<{
    branchId: string;
    basePrice: string;
    taxPercentage: string;
  } | null>(null);
  const [branchPriceToDelete, setBranchPriceToDelete] = useState<{
    mealId: string;
    branchId: string;
    branchName: string;
  } | null>(null);
  const [isDeleteBranchPriceDialogOpen, setIsDeleteBranchPriceDialogOpen] = useState(false);
  const [formData, setFormData] = useState<
    Omit<MealFormData, "basePrice"> & { id?: string; basePrice: number | null }
  >({
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
    excludedBranches: [],
    isFeatured: false,
    isDrink: false,
  });
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const latestMealsRequestIdRef = useRef(0);

  useEffect(() => {
    if (!categoryId) {
      navigate("/admin/menu", { replace: true });
      return;
    }
    setSelectedCategory(categoryId);
    setMeals([]);
    setCurrentPage(1);
    setSortBy("listOrder");
    setSortOrder("asc");
  }, [categoryId, navigate]);

  // Load data for non-search operations
  useEffect(() => {
    if (!selectedCategory) return;
    loadData();
  }, [currentPage, selectedCategory, selectedStatus, sortBy, sortOrder, orgVersion]);

  // Debounced search effect
  useEffect(() => {
    const normalized = searchTerm.trim();
    if (!normalized) {
      if (!selectedCategory) return;
      loadData();
      return;
    }

    const timeoutId = setTimeout(() => {
      if (!selectedCategory) return;
      loadSearchResults();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, selectedCategory, selectedStatus, sortBy, sortOrder, orgVersion]);

  // React to organization switch changes
  useEffect(() => {
    const getSelectedOrganizationId = (): string => {
      try {
        const raw = window.localStorage.getItem(ORG_STORAGE_KEY);
        return (raw || "").trim();
      } catch {
        return "";
      }
    };

    let currentOrgId = getSelectedOrganizationId();

    const applyOrgChange = (nextOrgId: string) => {
      const normalized = String(nextOrgId || "").trim();
      if (normalized === currentOrgId) return;
      currentOrgId = normalized;

      // Keep route/categoryId, but reset page state and refetch under new org header.
      setMeals([]);
      setTotalPages(1);
      setTotalCount(0);
      setSearchTerm("");
      setSelectedStatus("all");
      setSortBy("listOrder");
      setSortOrder("asc");
      setCurrentPage(1);
      setShowDropdownMenu(null);
      setShowDeleteDialog(null);
      setIsViewDialogOpen(false);
      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      setSelectedMeal(null);
      setIsDeleteBranchPriceDialogOpen(false);
      setBranchPriceToDelete(null);
      setEditingBranchPrice(null);
      setShowEditAddons(false);
      setShowEditDeclarations(false);
      setShowEditOptionalIngredients(false);

      setCategories([]);
      setAddons([]);
      setDeclarations([]);
      setOptionalIngredients([]);
      setBranches([]);
      setBranchPrices([]);

      setOrgVersion((v) => v + 1);
    };

    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as any;
      applyOrgChange(detail?.organizationId);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== ORG_STORAGE_KEY) return;
      applyOrgChange(event.newValue || "");
    };

    window.addEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Position dropdown menus when they open
  useEffect(() => {
    if (showDropdownMenu) {
      const button = buttonRefs.current[showDropdownMenu];
      const dropdown = dropdownRefs.current[showDropdownMenu];

      if (button && dropdown) {
        const rect = button.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
      }
    }
  }, [showDropdownMenu]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDropdownMenu) {
        const target = event.target as HTMLElement;
        if (
          !target.closest(`[data-dropdown-menu]`) &&
          !target.closest(`[data-dropdown-trigger]`)
        ) {
          setShowDropdownMenu(null);
        }
      }
    };

    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdownMenu]);

  const loadData = async () => {
    const requestId = ++latestMealsRequestIdRef.current;
    try {
      setLoading(true);
      const token = await getToken();
      const [mealsData, categoriesData, addonsData, declarationsData, optionalIngredientsData] = await Promise.all([
        mealService.getMeals(
          currentPage,
          9,
          searchTerm,
          sortBy,
          sortOrder,
          selectedCategory,
          token || undefined
        ),
        categoryService.getCategories(1, 100, "", "createdAt", "desc", token || undefined),
        addonService.getAddons(1, 100, "", "createdAt", "desc", token || undefined),
        declarationService.getAllDeclarations(undefined, token || undefined),
        optionalIngredientService.getAllOptionalIngredients(token || undefined),
      ]);

      const branchesData = await branchService.getBranches(token || undefined);

      let filteredMeals = mealsData.meals;
      if (selectedCategory) {
        filteredMeals = filteredMeals.filter((meal) => meal.categoryId === selectedCategory);
      }
      if (selectedStatus && selectedStatus !== "all") {
        filteredMeals = filteredMeals.filter(
          (meal) =>
            (selectedStatus === "ACTIVE" && meal.isActive) ||
            (selectedStatus === "INACTIVE" && !meal.isActive)
        );
      }

      if (requestId !== latestMealsRequestIdRef.current) return;
      setMeals(filteredMeals);
      setTotalPages(mealsData.pagination.totalPages);
      setTotalCount(mealsData.pagination.totalCount);
      setCategories(categoriesData.categories.filter((c) => c.isActive));
      setAddons(addonsData.addons);
      setDeclarations(Array.isArray(declarationsData) ? declarationsData : []);
      setOptionalIngredients(Array.isArray(optionalIngredientsData) ? optionalIngredientsData : []);
      setBranches(Array.isArray(branchesData) ? branchesData : []);
    } catch (error) {
      console.error("Error loading meals:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExcludedBranch = (branchId: string) => {
    const currentExcluded = formData.excludedBranches || [];
    const nextExcluded = currentExcluded.includes(branchId)
      ? currentExcluded.filter((id) => id !== branchId)
      : [...currentExcluded, branchId];
    setFormData({
      ...formData,
      excludedBranches: nextExcluded,
    });
  };

  const loadBranchPrices = async (mealId: string) => {
    try {
      setLoadingBranchPrices(true);
      const token = await getToken();
      const prices = await mealService.getMealBranchPrices(mealId, token || undefined);
      setBranchPrices(Array.isArray(prices) ? prices : []);
    } catch (error) {
      console.error("Failed to load branch prices:", error);
      setBranchPrices([]);
    } finally {
      setLoadingBranchPrices(false);
    }
  };

  const handleSaveBranchPrice = async () => {
    if (!editingBranchPrice || !formData.id) return;

    try {
      const token = await getToken();
      const basePrice = parseFloat(editingBranchPrice.basePrice);
      if (isNaN(basePrice) || basePrice < 0) {
        alert(
          t("admin.menuManagement.branchPriceEnterValid", {
            defaultValue: "Please enter a valid price",
          })
        );
        return;
      }

      await mealService.upsertMealBranchPrice(
        formData.id,
        {
          branchId: editingBranchPrice.branchId,
          basePrice,
          taxPercentage: editingBranchPrice.taxPercentage
            ? parseFloat(editingBranchPrice.taxPercentage)
            : null,
        },
        token || undefined
      );

      await loadBranchPrices(formData.id);
      setEditingBranchPrice(null);
    } catch (error) {
      console.error("Failed to save branch price:", error);
      alert(
        t("admin.menuManagement.branchPriceSaveFailed", {
          defaultValue: "Failed to save branch price",
        })
      );
    }
  };

  const handleDeleteBranchPriceClick = (mealId: string, branchId: string, branchName: string) => {
    setBranchPriceToDelete({ mealId, branchId, branchName });
    setIsDeleteBranchPriceDialogOpen(true);
  };

  const handleDeleteBranchPrice = async () => {
    if (!branchPriceToDelete) return;
    try {
      const token = await getToken();
      await mealService.deleteMealBranchPrice(
        branchPriceToDelete.mealId,
        branchPriceToDelete.branchId,
        token || undefined
      );
      await loadBranchPrices(branchPriceToDelete.mealId);
      setIsDeleteBranchPriceDialogOpen(false);
      setBranchPriceToDelete(null);
    } catch (error) {
      console.error("Failed to delete branch price:", error);
      alert(
        t("admin.menuManagement.branchPriceDeleteFailed", {
          defaultValue: "Failed to delete branch price",
        })
      );
    }
  };

  const loadSearchResults = async () => {
    const requestId = ++latestMealsRequestIdRef.current;
    try {
      setMenuItemsLoading(true);
      const token = await getToken();
      const mealsData = await mealService.getMeals(
        1,
        9,
        searchTerm,
        sortBy,
        sortOrder,
        selectedCategory,
        token || undefined
      );

      let filteredMeals = mealsData.meals;
      if (selectedCategory) {
        filteredMeals = filteredMeals.filter((meal) => meal.categoryId === selectedCategory);
      }
      if (selectedStatus && selectedStatus !== "all") {
        filteredMeals = filteredMeals.filter(
          (meal) =>
            (selectedStatus === "ACTIVE" && meal.isActive) ||
            (selectedStatus === "INACTIVE" && !meal.isActive)
        );
      }

      if (requestId !== latestMealsRequestIdRef.current) return;
      setMeals(filteredMeals);
      setTotalPages(mealsData.pagination.totalPages);
      setTotalCount(mealsData.pagination.totalCount);
      setCurrentPage(1);
    } catch (error) {
      console.error("Error searching meals:", error);
    } finally {
      setMenuItemsLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleCategoryFilter = (categoryId: string) => {
    const next = categoryId === "all" ? "" : categoryId;
    setSelectedCategory(next);
    setCurrentPage(1);
    if (!next) {
      navigate("/admin/menu");
      return;
    }
    navigate(`/admin/menu/${next}`);
  };

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status);
    setCurrentPage(1);
  };

  const handleViewMeal = async (meal: Meal) => {
    try {
      const token = await getToken();
      const fullMealDetails = await mealService.getMealById(
        meal.id,
        token || undefined
      );
      setSelectedMeal(fullMealDetails);
      loadBranchPrices(fullMealDetails.id);
    } catch (error) {
      console.error("Error fetching meal details:", error);
      setSelectedMeal(meal);
      loadBranchPrices(meal.id);
    }
    setIsViewDialogOpen(true);
  };

  const parsePrice = (price: string | number): number => {
    if (typeof price === "number") return price;
    if (typeof price === "string") {
      const parsed = parseFloat(price);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  // Format number to string, removing unnecessary decimal places and floating-point errors
  const formatNumberForInput = (num: number): string => {
    // Round to 10 decimal places to handle floating-point errors
    const rounded = Math.round(num * 10000000000) / 10000000000;
    // If exactly 0, return ""
    if (rounded === 0) return "";
    // Convert to string and remove trailing zeros and decimal point if not needed
    return rounded.toString().replace(/\.?0+$/, "");
  };

  const handleBasePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Allow empty string
    if (value === "") {
      setBasePriceInput("");
      setFormData({
        ...formData,
        basePrice: 0,
      });
      return;
    }
    
    // Only allow numbers and one decimal point
    // Pattern: digits optionally followed by a dot and more digits
    const validPattern = /^\d*\.?\d*$/;
    
    if (validPattern.test(value)) {
      // Ensure only one decimal point
      const decimalCount = (value.match(/\./g) || []).length;
      if (decimalCount <= 1) {
        setBasePriceInput(value);
        setFormData({
          ...formData,
          basePrice: parseFloat(value) || 0,
        });
      }
    }
  };

  const handleSizePriceChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Allow empty string
    if (value === "") {
      setSizePriceInputs({ ...sizePriceInputs, [index]: "" });
      updateSize(index, "price", 0);
      return;
    }
    
    // Only allow numbers and one decimal point
    // Pattern: digits optionally followed by a dot and more digits
    const validPattern = /^\d*\.?\d*$/;
    
    if (validPattern.test(value)) {
      // Ensure only one decimal point
      const decimalCount = (value.match(/\./g) || []).length;
      if (decimalCount <= 1) {
        setSizePriceInputs({ ...sizePriceInputs, [index]: value });
        updateSize(index, "price", parseFloat(value) || 0);
      }
    }
  };

  // Helper functions for image URLs
  const isExternalImage = (url: string): boolean => {
    return url.startsWith("http://") || url.startsWith("https://");
  };

  const getOptimizedImageUrl = (imagePath: string): string => {
    if (!imagePath) return "";
    if (isExternalImage(imagePath)) {
      return imagePath;
    }
    // Use API_BASE_URL to construct the full image URL
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
    return `${apiUrl}/uploads/images/${imagePath}`;
  };

  const handleCreateMeal = () => {
    setBasePriceInput("");
    setSizePriceInputs({});
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
      excludedBranches: [],
      isFeatured: false,
      isDrink: false,
    });
    setBranchPrices([]);
    setEditingBranchPrice(null);
    setAddonSearchTerm("");
    setDeclarationSearchTerm("");
    setOptionalIngredientSearchTerm("");
    setShowEditAddons(false);
    setFilterAddonsByCategory(false);
    setShowEditDeclarations(false);
    setShowEditOptionalIngredients(false);
    setIsCreateDialogOpen(true);
  };

  const handleEditMeal = async (meal: Meal) => {
    try {
      const token = await getToken();
      const fullMealDetails = await mealService.getMealById(
        meal.id,
        token || undefined
      );
      const basePrice = parsePrice(fullMealDetails.basePrice);
      setFormData({
        id: fullMealDetails.id,
        name: fullMealDetails.name,
        description: fullMealDetails.description || "",
        basePrice: basePrice,
        taxPercentage: fullMealDetails.taxPercentage,
        categoryId: fullMealDetails.categoryId,
        image: fullMealDetails.image || undefined,
        sizes: fullMealDetails.mealSizes.map((size) => ({
          id: size.id,
          name: size.name,
          price: parsePrice(size.price),
          taxPercentage: size.taxPercentage || null,
        })),
        addOnIds: fullMealDetails.mealAddOns.map((addon) => addon.addOn.id),
        declarationIds: fullMealDetails.mealDeclarations?.map((decl) => decl.declaration.id) || [],
        optionalIngredientIds: fullMealDetails.mealOptionalIngredients?.map((ing) => ing.optionalIngredient.id) || [],
        excludedBranches: fullMealDetails.excludedBranches || [],
        isFeatured: fullMealDetails.isFeatured || false,
        isDrink: Boolean((fullMealDetails as any)?.isDrink),
      });
      setBasePriceInput(formatNumberForInput(basePrice));
      const sizeInputs: Record<number, string> = {};
      fullMealDetails.mealSizes.forEach((size, index) => {
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
      await loadBranchPrices(fullMealDetails.id);
      setIsEditDialogOpen(true);
    } catch (error) {
      console.error("Error fetching meal details:", error);
      // Fallback to basic meal data
      const fallbackBasePrice = parsePrice(meal.basePrice);
      setFormData({
        id: meal.id,
        name: meal.name,
        description: meal.description || "",
        basePrice: fallbackBasePrice,
        taxPercentage: meal.taxPercentage,
        categoryId: meal.categoryId,
        image: meal.image || undefined,
        sizes: meal.mealSizes.map((size) => ({
          id: size.id,
          name: size.name,
          price: parsePrice(size.price),
          taxPercentage: size.taxPercentage || null,
        })),
        addOnIds: meal.mealAddOns.map((addon) => addon.addOn.id),
        declarationIds: meal.mealDeclarations?.map((decl) => decl.declaration.id) || [],
        optionalIngredientIds: meal.mealOptionalIngredients?.map((ing) => ing.optionalIngredient.id) || [],
        excludedBranches: meal.excludedBranches || [],
        isFeatured: meal.isFeatured || false,
        isDrink: Boolean((meal as any)?.isDrink),
      });
      setBasePriceInput(formatNumberForInput(fallbackBasePrice));
      const fallbackSizeInputs: Record<number, string> = {};
      meal.mealSizes.forEach((size, index) => {
        fallbackSizeInputs[index] = formatNumberForInput(parsePrice(size.price));
      });
      setSizePriceInputs(fallbackSizeInputs);
      await loadBranchPrices(meal.id);
      setIsEditDialogOpen(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.categoryId || formData.basePrice === null) return;

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
      { name: "", price: 0, taxPercentage: null },
    ];
    const newIndex = newSizes.length - 1;
    setFormData({ ...formData, sizes: newSizes });
    setSizePriceInputs({ ...sizePriceInputs, [newIndex]: "" });
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
    field: "name" | "price" | "taxPercentage",
    value: string | number | null
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
    const newOptionalIngredientIds = currentOptionalIngredientIds.includes(optionalIngredientId)
      ? currentOptionalIngredientIds.filter((id) => id !== optionalIngredientId)
      : [...currentOptionalIngredientIds, optionalIngredientId];
    setFormData({ ...formData, optionalIngredientIds: newOptionalIngredientIds });
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
      declaration.name.toLowerCase().includes(declarationSearchTerm.toLowerCase()) ||
      declaration.type?.toLowerCase().includes(declarationSearchTerm.toLowerCase()) ||
      declaration.description?.toLowerCase().includes(declarationSearchTerm.toLowerCase());

    // If checkbox is checked, only show selected declarations
    if (showEditDeclarations) {
      return matchesSearch && formData.declarationIds?.includes(declaration.id);
    }

    // If checkbox is unchecked, show all declarations (normal behavior)
    return matchesSearch;
  });

  const filteredOptionalIngredients = optionalIngredients.filter((ingredient) => {
    const matchesSearch =
      ingredient.name.toLowerCase().includes(optionalIngredientSearchTerm.toLowerCase()) ||
      ingredient.description?.toLowerCase().includes(optionalIngredientSearchTerm.toLowerCase());

    // If checkbox is checked, only show selected optional ingredients
    if (showEditOptionalIngredients) {
      return matchesSearch && formData.optionalIngredientIds?.includes(ingredient.id);
    }

    // If checkbox is unchecked, show all optional ingredients (normal behavior)
    return matchesSearch;
  });

  const handleToggleStatus = async (meal: Meal) => {
    try {
      setIsActionLoading(meal.id);
      const token = await getToken();
      await mealService.toggleMealStatus(meal.id, token || undefined);
      setShowDropdownMenu(null);
      await loadData();
    } catch (error) {
      console.error("Error toggling meal status:", error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleDeleteMeal = async (meal: Meal) => {
    try {
      setIsActionLoading(meal.id);
      const token = await getToken();
      await mealService.deleteMeal(meal.id, token || undefined);
      setShowDeleteDialog(null);
      await loadData();
    } catch (error) {
      console.error("Error deleting meal:", error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const getStatusColor = (isActive: boolean) => {
    if (isActive) {
      return { bg: "#d1fae5", text: "#065f46" };
    }
    return { bg: "#fee2e2", text: "#991b1b" };
  };

  const currentCategory = categories.find((category) => category.id === selectedCategory);

  const canReorderCategoryMeals = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.REORDER_CATEGORY },
    { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_CATEGORY },
  ]);

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

  const canToggleMealStatus = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.TOGGLE_ACTIVE },
    { resource: RESOURCES.MEALS, action: ACTIONS.TOGGLE_ACTIVE },
  ]);

  if (loading) {
    return (
      <div style={{ padding: "24px", height: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: "600",
                color: "#ec4899",
                marginBottom: "4px",
              }}
            >
              {t("admin.menuManagement.title")}
            </h2>
            <p style={{ fontSize: "14px", color: "#6b7280" }}>
              {t("admin.menuManagement.description")}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <RefreshCw
              style={{
                height: "16px",
                width: "16px",
                color: "#ec4899",
                animation: "spin 1s linear infinite",
              }}
            />
            <span style={{ fontSize: "14px", color: "#6b7280" }}>
              {t("admin.menuManagement.loading")}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <RefreshCw
              style={{
                height: "48px",
                width: "48px",
                color: "#ec4899",
                margin: "0 auto 16px",
                animation: "spin 1s linear infinite",
              }}
            />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "8px",
              }}
            >
              {t("admin.menuManagement.loadingTitle")}
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280" }}>
              {t("admin.menuManagement.loadingDescription")}
            </p>
          </div>
        </div>
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#ffffff",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "24px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/admin/menu")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: 0,
            border: "none",
            backgroundColor: "transparent",
            color: "#6b7280",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
            width: "fit-content",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#111827";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#6b7280";
          }}
        >
          <ChevronLeft style={{ width: "16px", height: "16px" }} />
          {t("admin.menuManagement.backToCategories", { defaultValue: "Back to categories" })}
        </button>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "12px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "#111827",
                marginBottom: "6px",
              }}
            >
              {currentCategory?.name || t("admin.menuManagement.title")}
            </h1>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
              {currentCategory?.description || t("admin.menuManagement.description")}
            </p>
            {currentCategory && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "10px",
                  fontSize: "12px",
                  color: "#9ca3af",
                  fontWeight: 600,
                }}
              >
                <span>
                  {t("admin.menuCategories.mealCount", {
                    defaultValue: "{{count}} meal(s)",
                    count: currentCategory._count?.meals ?? 0,
                  })}
                </span>
                <span>•</span>
                <span>
                  {currentCategory.isActive
                    ? t("admin.menuCategories.statusActive", { defaultValue: "Active" })
                    : t("admin.menuCategories.statusInactive", { defaultValue: "Inactive" })}
                </span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {selectedCategory && canReorderCategoryMeals && (
              <button
                type="button"
                onClick={() => navigate(`/admin/menu/${selectedCategory}/order`)}
                style={{
                  padding: "10px 14px",
                  fontSize: "14px",
                  fontWeight: 700,
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  color: "#111827",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {t("admin.menuManagement.reorderMeals", { defaultValue: "Reorder meals" })}
              </button>
            )}

            {canCreateMeal && (
              <button
                type="button"
                onClick={handleCreateMeal}
                style={{
                  padding: "10px 14px",
                  fontSize: "14px",
                  fontWeight: 800,
                  border: "1px solid #ec4899",
                  borderRadius: "10px",
                  backgroundColor: "#ec4899",
                  color: "#ffffff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#db2777";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ec4899";
                }}
              >
                <Plus style={{ height: "16px", width: "16px" }} />
                {t("admin.menuManagement.addMeal")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            border: "1px solid #e5e7eb",
            backgroundColor: "#ffffff",
            borderRadius: "14px",
            padding: "16px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ position: "relative" }}>
              <Search
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  height: "16px",
                  width: "16px",
                  color: "#9ca3af",
                }}
              />
              <input
                type="text"
                placeholder={t("admin.menuManagement.searchPlaceholder", { defaultValue: "Search meals..." })}
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 36px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "10px",
                  outline: "none",
                  backgroundColor: "transparent",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#ec4899";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              <OrganizationSearchSelect
                organizations={[
                  {
                    id: "all",
                    name: currentCategory?.name || t("admin.menuManagement.allCategories"),
                  },
                  ...categories.map((category) => ({
                    id: category.id,
                    name: category.name,
                  })),
                ]}
                value={selectedCategory || "all"}
                onValueChange={(next) => handleCategoryFilter(next)}
                placeholder={t("admin.menuManagement.allCategories")}
                searchPlaceholder={t("common.search")}
                noResultsText={t("common.noResults")}
              />

              <OrganizationSearchSelect
                organizations={[
                  { id: "all", name: t("admin.menuManagement.allStatus") },
                  { id: "ACTIVE", name: t("admin.menuManagement.active") },
                  { id: "INACTIVE", name: t("admin.menuManagement.inactive") },
                ]}
                value={selectedStatus}
                onValueChange={(next) => handleStatusFilter(next)}
                placeholder={t("admin.menuManagement.allStatus")}
                searchPlaceholder={t("common.search")}
                noResultsText={t("common.noResults")}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 600 }}>
                {t("admin.menuManagement.sortBy", { defaultValue: "Sort by" })}:
              </span>
              <button
                type="button"
                onClick={() => {
                  if (sortBy === "name") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("name");
                    setSortOrder("asc");
                  }
                  setCurrentPage(1);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: sortBy === "name" ? "1px solid #ec4899" : "1px solid #e5e7eb",
                  backgroundColor: sortBy === "name" ? "#ec4899" : "transparent",
                  color: sortBy === "name" ? "#ffffff" : "#111827",
                  fontWeight: 800,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                {t("admin.menuManagement.nameAZ", { defaultValue: "Name A-Z" })}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sortBy === "createdAt") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("createdAt");
                    setSortOrder("desc");
                  }
                  setCurrentPage(1);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: sortBy === "createdAt" ? "1px solid #ec4899" : "1px solid #e5e7eb",
                  backgroundColor: sortBy === "createdAt" ? "#ec4899" : "transparent",
                  color: sortBy === "createdAt" ? "#ffffff" : "#111827",
                  fontWeight: 800,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                {sortBy === "createdAt" && sortOrder === "asc"
                  ? t("admin.menuManagement.oldestFirst", { defaultValue: "Oldest First" })
                  : t("admin.menuManagement.newestFirst", { defaultValue: "Newest First" })}
              </button>

              <button
                type="button"
                onClick={loadData}
                style={{
                  marginLeft: "auto",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#111827",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <RefreshCw style={{ width: "14px", height: "14px" }} />
                {t("admin.menuManagement.refresh", { defaultValue: "Refresh" })}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {menuItemsLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(255, 255, 255, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
          >
            <Loader2
              style={{
                height: "32px",
                width: "32px",
                animation: "spin 1s linear infinite",
                color: "#ec4899",
              }}
            />
          </div>
        )}
        <div style={{ padding: "16px 24px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "14px",
            }}
          >
            {meals.map((meal) => {
              const statusColor = getStatusColor(meal.isActive);
              return (
                <div
                  key={meal.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "18px",
                    backgroundColor: "#ffffff",
                    overflow: "hidden",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  }}
                >
                  <div style={{ position: "relative", height: "150px", backgroundColor: "#f3f4f6" }}>
                    {meal.image ? (
                      <img
                        src={getOptimizedImageUrl(meal.image)}
                        alt={meal.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#9ca3af",
                        }}
                      >
                        <Utensils style={{ width: "28px", height: "28px" }} />
                      </div>
                    )}

                    <div style={{ position: "absolute", top: "10px", left: "10px" }}>
                      <span
                        style={{
                          padding: "5px 12px",
                          fontSize: "12px",
                          borderRadius: "999px",
                          fontWeight: 800,
                          backgroundColor: statusColor.bg,
                          color: statusColor.text,
                        }}
                      >
                        {meal.isActive
                          ? t("admin.menuManagement.active", { defaultValue: "Active" })
                          : t("admin.menuManagement.inactive", { defaultValue: "Inactive" })}
                      </span>
                    </div>

                    <div style={{ position: "absolute", top: "10px", right: "10px" }}>
                      <button
                        ref={(el) => {
                          buttonRefs.current[meal.id] = el;
                        }}
                        data-dropdown-trigger
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDropdownMenu(showDropdownMenu === meal.id ? null : meal.id);
                        }}
                        disabled={isActionLoading === meal.id}
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "999px",
                          border: "1px solid rgba(255,255,255,0.6)",
                          backgroundColor: "rgba(255,255,255,0.65)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: isActionLoading === meal.id ? 0.7 : 1,
                        }}
                      >
                        <MoreVertical style={{ height: "16px", width: "16px", color: "#6b7280" }} />
                      </button>
                      {showDropdownMenu === meal.id && (
                        <div
                          ref={(el) => {
                            dropdownRefs.current[meal.id] = el;
                          }}
                          data-dropdown-menu
                          style={{
                            position: "fixed",
                            backgroundColor: "#ffffff",
                            border: "1px solid #e5e7eb",
                            borderRadius: "12px",
                            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
                            zIndex: 1000,
                            minWidth: "180px",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDropdownMenu(null);
                              handleViewMeal(meal);
                            }}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              textAlign: "left",
                              border: "none",
                              backgroundColor: "transparent",
                              cursor: "pointer",
                              fontSize: "14px",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              color: "#111827",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#f9fafb";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            <Eye style={{ height: "16px", width: "16px" }} />
                            {t("admin.menuManagement.viewDetails")}
                          </button>
                          {canUpdateMeal && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDropdownMenu(null);
                                handleEditMeal(meal);
                              }}
                              disabled={isActionLoading === meal.id}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                textAlign: "left",
                                border: "none",
                                backgroundColor: "transparent",
                                cursor: "pointer",
                                fontSize: "14px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                color: "#111827",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#f9fafb";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                            >
                              <Edit style={{ height: "16px", width: "16px" }} />
                              {t("admin.menuManagement.editMeal")}
                            </button>
                          )}

                          {canToggleMealStatus && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDropdownMenu(null);
                                handleToggleStatus(meal);
                              }}
                              disabled={isActionLoading === meal.id}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                textAlign: "left",
                                border: "none",
                                backgroundColor: "transparent",
                                cursor: "pointer",
                                fontSize: "14px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                color: "#111827",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#f9fafb";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                            >
                              {meal.isActive ? (
                                <>
                                  <EyeOff style={{ height: "16px", width: "16px" }} />
                                  {t("admin.menuManagement.deactivate")}
                                </>
                              ) : (
                                <>
                                  <Eye style={{ height: "16px", width: "16px" }} />
                                  {t("admin.menuManagement.activate")}
                                </>
                              )}
                            </button>
                          )}

                          {(canDeleteMeal && (canUpdateMeal || canToggleMealStatus)) && (
                            <div style={{ height: "1px", backgroundColor: "#e5e7eb", margin: "6px 0" }} />
                          )}

                          {canDeleteMeal && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDropdownMenu(null);
                                setShowDeleteDialog(meal.id);
                              }}
                              disabled={isActionLoading === meal.id}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                textAlign: "left",
                                border: "none",
                                backgroundColor: "transparent",
                                cursor: "pointer",
                                fontSize: "14px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                color: "#dc2626",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#fef2f2";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                            >
                              <Trash2 style={{ height: "16px", width: "16px" }} />
                              {t("admin.menuManagement.deleteMeal")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: "12px 12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                      <div>
                        <div style={{ fontSize: "15px", fontWeight: 900, color: "#111827" }}>{meal.name}</div>
                        <div style={{ fontSize: "12px", color: "#9ca3af", fontWeight: 700, marginTop: "2px" }}>
                          {meal.category?.name || currentCategory?.name || ""}
                        </div>
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 900, color: "#111827" }}>
                        {formatPrice(parseFloat(meal.basePrice), "USD")}
                      </div>
                    </div>

                    {meal.description && (
                      <div
                        style={{
                          marginTop: "10px",
                          fontSize: "13px",
                          color: "#6b7280",
                          lineHeight: 1.4,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {meal.description}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: "12px",
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "11px",
                        color: "#9ca3af",
                        fontWeight: 700,
                      }}
                    >
                      <span>
                        {t("admin.menuManagement.sizes", {
                          defaultValue: "{{count}} size(s)",
                          count: meal.mealSizes?.length || 0,
                        })}
                      </span>
                      <span>
                        {t("admin.menuManagement.addons", {
                          defaultValue: "{{count}} addon(s)",
                          count: meal.mealAddOns?.length || 0,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {meals.length === 0 && !loading && (
          <div
            style={{
              padding: "48px",
              textAlign: "center",
              color: "#6b7280",
            }}
          >
            <Utensils
              style={{
                height: "48px",
                width: "48px",
                margin: "0 auto 16px",
                color: "#d1d5db",
              }}
            />
            <div style={{ fontSize: "16px", fontWeight: "500", marginBottom: "4px" }}>
              {t("admin.menuManagement.noMealsFound")}
            </div>
            <div style={{ fontSize: "14px" }}>
              {searchTerm
                ? t("admin.menuManagement.tryAdjustingSearch")
                : t("admin.menuManagement.getStartedByAdding")}
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: "14px", color: "#6b7280" }}>
            {t("admin.menuManagement.showingMeals", { count: meals.length, total: totalCount })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              style={{
                padding: "6px 12px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                backgroundColor: "#ffffff",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                opacity: currentPage === 1 ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
              onMouseEnter={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }
              }}
            >
              <ChevronLeft style={{ height: "16px", width: "16px" }} />
              {t("common.previous")}
            </button>
            <div
              style={{
                padding: "6px 12px",
                fontSize: "14px",
                fontWeight: "500",
                color: "#111827",
              }}
            >
              {t("admin.menuManagement.pageOf", { current: currentPage, total: totalPages })}
            </div>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              style={{
                padding: "6px 12px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                backgroundColor: "#ffffff",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                opacity: currentPage === totalPages ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
              onMouseEnter={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }
              }}
            >
              {t("common.next")}
              <ChevronRight style={{ height: "16px", width: "16px" }} />
            </button>
          </div>
        </div>
      )}

      {/* View Meal Dialog */}
      {isViewDialogOpen && selectedMeal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "24px",
          }}
          onClick={() => setIsViewDialogOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "800px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  color: "#111827",
                }}
              >
                {t("admin.menuManagement.mealDetails")}
              </h3>
              <button
                onClick={() => setIsViewDialogOpen(false)}
                style={{
                  padding: "4px",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  borderRadius: "4px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <XCircle style={{ height: "20px", width: "20px", color: "#6b7280" }} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 500 }}>
                    {t("admin.menuManagement.basePrice")}
                  </div>
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      backgroundColor: "#ffffff",
                      color: "#111827",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    {formatPrice(parseFloat(selectedMeal.basePrice.toString()), "USD")}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 500 }}>
                    {t("admin.menuManagement.taxPercentage")}
                  </div>
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      backgroundColor: "#ffffff",
                      color: "#111827",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    {selectedMeal.taxPercentage != null ? `${selectedMeal.taxPercentage}%` : ""}
                  </div>
                </div>
              </div>

              {/* Branch-specific overrides */}
              {loadingBranchPrices ? (
                <div>
                  <h4
                    style={{
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#111827",
                      marginBottom: "12px",
                    }}
                  >
                    {t("admin.menuManagement.branchSpecificPrices")}
                  </h4>
                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "8px",
                      backgroundColor: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      fontSize: "14px",
                      color: "#6b7280",
                    }}
                  >
                    ...
                  </div>
                </div>
              ) : Array.isArray(branchPrices) && branchPrices.length > 0 ? (
                <div>
                  <h4
                    style={{
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#111827",
                      marginBottom: "12px",
                    }}
                  >
                    {t("admin.menuManagement.branchSpecificPrices")}
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {branchPrices
                      .slice()
                      .sort((a, b) => (a.branch?.name || "").localeCompare(b.branch?.name || ""))
                      .map((bp) => (
                        <div
                          key={bp.id || bp.branchId}
                          style={{
                            padding: "12px",
                            backgroundColor: "#f9fafb",
                            borderRadius: "8px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            border: "1px solid #e5e7eb",
                            gap: "12px",
                          }}
                        >
                          <span style={{ fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                            {bp.branch?.name || "-"}
                          </span>
                          <span style={{ fontSize: "13px", color: "#6b7280", whiteSpace: "nowrap" }}>
                            {formatPrice(parsePrice(bp.basePrice), "USD")} · {bp.taxPercentage != null ? `${bp.taxPercentage}%` : "-"}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 500 }}>
                    {t("admin.menuManagement.mealName")}
                  </div>
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      backgroundColor: "#ffffff",
                      color: "#111827",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    {selectedMeal.name}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 500 }}>
                    {t("admin.menuManagement.category")}
                  </div>
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      backgroundColor: "#ffffff",
                      color: "#111827",
                      fontSize: "14px",
                    }}
                  >
                    {selectedMeal.category?.name || t("admin.menuManagement.nA")}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 500 }}>
                    {t("admin.menuManagement.descriptionLabel")}
                  </div>
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      backgroundColor: "#ffffff",
                      color: "#111827",
                      fontSize: "14px",
                      minHeight: "72px",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {selectedMeal.description || ""}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                  <div>
                    <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 500 }}>
                      {t("admin.menuManagement.featured")}
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        backgroundColor: "#ffffff",
                        color: "#111827",
                        fontSize: "14px",
                      }}
                    >
                      {selectedMeal.isFeatured ? t("common.yes", { defaultValue: "Yes" }) : t("common.no", { defaultValue: "No" })}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 500 }}>
                      {t("admin.menuManagement.type", { defaultValue: "Type" })}
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        backgroundColor: "#ffffff",
                        color: "#111827",
                        fontSize: "14px",
                      }}
                    >
                      {Boolean((selectedMeal as any).isDrink)
                        ? t("admin.menuManagement.drink", { defaultValue: "Drink" })
                        : t("admin.menuManagement.food", { defaultValue: "Food" })}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 500 }}>
                      {t("admin.menuManagement.status")}
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        backgroundColor: "#ffffff",
                        color: "#111827",
                        fontSize: "14px",
                      }}
                    >
                      {selectedMeal.isActive ? t("admin.menuManagement.active") : t("admin.menuManagement.inactive")}
                    </div>
                  </div>
                </div>
              </div>

              {selectedMeal.image && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "13px", color: "#6b7280", fontWeight: 500 }}>
                    {t("admin.menuManagement.mealImage")}
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "240px",
                      borderRadius: "8px",
                      overflow: "hidden",
                      border: "1px solid #e5e7eb",
                      backgroundColor: "#f9fafb",
                    }}
                  >
                    <img
                      src={getOptimizedImageUrl(selectedMeal.image)}
                      alt={selectedMeal.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Sizes */}
              {selectedMeal.mealSizes && selectedMeal.mealSizes.length > 0 && (
                <div>
                  <h4
                    style={{
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#111827",
                      marginBottom: "12px",
                    }}
                  >
                    {t("admin.menuManagement.sizesCount", { count: selectedMeal.mealSizes.length })}
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {selectedMeal.mealSizes.map((size) => (
                      <div
                        key={size.id || size.name}
                        style={{
                          padding: "12px",
                          backgroundColor: "#f9fafb",
                          borderRadius: "8px",
                          display: "flex",
                          justifyContent: "space-between",
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <span style={{ fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                          {size.name}
                        </span>
                        <span style={{ fontSize: "14px", fontWeight: "600", color: "#ec4899" }}>
                          {formatPrice(size.price, "USD")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <button
                onClick={() => setIsViewDialogOpen(false)}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  color: "#111827",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                {t("admin.menuManagement.close")}
              </button>
              {canUpdateMeal && (
                <button
                  onClick={() => {
                    setIsViewDialogOpen(false);
                    handleEditMeal(selectedMeal);
                  }}
                  style={{
                    padding: "8px 16px",
                    fontSize: "14px",
                    border: "none",
                    borderRadius: "6px",
                    backgroundColor: "#ec4899",
                    cursor: "pointer",
                    color: "#ffffff",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#db2777";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#ec4899";
                  }}
                >
                  {t("admin.menuManagement.editMeal")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && meals.find((m) => m.id === showDeleteDialog) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setShowDeleteDialog(null)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "8px",
              }}
            >
              {t("admin.menuManagement.deleteMealTitle")}
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px" }}>
              {t("admin.menuManagement.deleteMealDescription")}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={() => setShowDeleteDialog(null)}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  color: "#111827",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                {t("admin.menuManagement.deleteMealCancel")}
              </button>
              <button
                onClick={() => {
                  const meal = meals.find((m) => m.id === showDeleteDialog);
                  if (meal) {
                    handleDeleteMeal(meal);
                  }
                }}
                disabled={
                  isActionLoading === showDeleteDialog || isActionLoading !== null
                }
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor: "#dc2626",
                  cursor:
                    isActionLoading === showDeleteDialog || isActionLoading !== null
                      ? "not-allowed"
                      : "pointer",
                  color: "#ffffff",
                  opacity:
                    isActionLoading === showDeleteDialog || isActionLoading !== null ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (
                    isActionLoading !== showDeleteDialog &&
                    isActionLoading === null
                  ) {
                    e.currentTarget.style.backgroundColor = "#b91c1c";
                  }
                }}
                onMouseLeave={(e) => {
                  if (
                    isActionLoading !== showDeleteDialog &&
                    isActionLoading === null
                  ) {
                    e.currentTarget.style.backgroundColor = "#dc2626";
                  }
                }}
              >
                {t("admin.menuManagement.deleteMealConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Meal Dialog */}
      {isCreateDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "24px",
          }}
          onClick={() => setIsCreateDialogOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "900px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  color: "#111827",
                }}
              >
                {t("admin.menuManagement.createNewMeal")}
              </h3>
              <button
                onClick={() => setIsCreateDialogOpen(false)}
                style={{
                  padding: "4px",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  borderRadius: "4px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <XCircle style={{ height: "20px", width: "20px", color: "#6b7280" }} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                    {t("admin.menuManagement.mealNameRequired")}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      outline: "none",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#ec4899";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                    {t("admin.menuManagement.basePriceRequired")}
                  </label>
                  <div style={{ position: "relative" }}>
                    <DollarSign
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        height: "16px",
                        width: "16px",
                        color: "#9ca3af",
                      }}
                    />
                    <input
                      type="text"
                      value={basePriceInput}
                      onChange={handleBasePriceChange}
                      placeholder={t("admin.menuManagement.basePriceRequired")}
                      required
                      disabled={isSubmitting}
                      style={{
                        width: "100%",
                        padding: "8px 12px 8px 36px",
                        fontSize: "14px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "6px",
                        outline: "none",
                        backgroundColor: isSubmitting ? "#f9fafb" : "#ffffff",
                        color: "#111827",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "#ec4899";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                  {t("admin.menuManagement.taxPercentage")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.taxPercentage !== null && formData.taxPercentage !== undefined ? formData.taxPercentage : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "") {
                      setFormData({
                        ...formData,
                        taxPercentage: null,
                      });
                    } else {
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue)) {
                        setFormData({
                          ...formData,
                          taxPercentage: numValue,
                        });
                      }
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#111827" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.isFeatured)}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                    disabled={isSubmitting}
                    style={{ width: "16px", height: "16px", accentColor: "#ec4899" }}
                  />
                  {t("admin.menuManagement.isFeatured", { defaultValue: "Featured" })}
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#111827" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.isDrink)}
                    onChange={(e) => setFormData({ ...formData, isDrink: e.target.checked })}
                    disabled={isSubmitting}
                    style={{ width: "16px", height: "16px", accentColor: "#ec4899" }}
                  />
                  {t("admin.menuManagement.isDrink", { defaultValue: "Drink" })}
                </label>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
                  {t("admin.menuManagement.excludedBranches", { defaultValue: "Excluded branches" })}
                </label>
                <p style={{ fontSize: "12px", color: "#6b7280", marginTop: 0 }}>
                  {t("admin.menuManagement.excludedBranchesDescription", {
                    defaultValue: "This meal will not be available in the selected branches.",
                  })}
                </p>

                <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "8px" }}>
                  {branches.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#6b7280", textAlign: "center", padding: "16px" }}>
                      {t("admin.menuManagement.noBranchesAvailable", { defaultValue: "No branches available" })}
                    </p>
                  ) : (
                    branches.map((branch) => {
                      const isExcluded = formData.excludedBranches?.includes(branch.id);
                      return (
                        <div
                          key={branch.id}
                          onClick={() => toggleExcludedBranch(branch.id)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            marginBottom: "4px",
                            backgroundColor: isExcluded ? "#fce7f3" : "transparent",
                            border: isExcluded ? "1px solid #ec4899" : "1px solid transparent",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                          onMouseEnter={(e) => {
                            if (!isExcluded) {
                              e.currentTarget.style.backgroundColor = "#f9fafb";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isExcluded) {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }
                          }}
                        >
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>{branch.name}</div>
                          {isExcluded && <Check style={{ height: "16px", width: "16px", color: "#ec4899" }} />}
                        </div>
                      );
                    })
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", marginTop: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                      {t("admin.menuManagement.excludedBranches", { defaultValue: "Excluded branches" })}
                    </p>
                    <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0 0" }}>
                      {t("admin.menuManagement.branchesExcluded", {
                        defaultValue: "{{count}} branch(es) excluded",
                        count: formData.excludedBranches?.length || 0,
                      })}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                  {t("admin.menuManagement.descriptionLabel")}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    resize: "vertical",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                  {t("admin.menuManagement.categoryRequired")}
                </label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    cursor: "pointer",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                >
                  <option value="">{t("admin.menuManagement.selectCategory")}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                  {t("admin.menuManagement.mealImage")}
                </label>
                <ImageUpload
                  key={`edit-${formData.id || 'new'}-${formData.image || 'no-image'}`}
                  value={formData.image}
                  onChange={(value) => setFormData({ ...formData, image: value || undefined })}
                  showPlaceholder={isEditDialogOpen && !formData.image}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                    {t("admin.menuManagement.mealSizes")}
                  </label>
                  <button
                    type="button"
                    onClick={addSize}
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      backgroundColor: "#ffffff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#ffffff";
                    }}
                  >
                    <Plus style={{ height: "14px", width: "14px" }} />
                    {t("admin.menuManagement.addSize")}
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {formData.sizes?.map((size, index) => (
                    <div key={index} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="text"
                          placeholder={t("admin.menuManagement.sizeNamePlaceholder")}
                          value={size.name}
                          onChange={(e) => updateSize(index, "name", e.target.value)}
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            fontSize: "14px",
                            border: "1px solid #e5e7eb",
                            borderRadius: "6px",
                            outline: "none",
                          }}
                        />
                        <div style={{ position: "relative" }}>
                          <DollarSign
                            style={{
                              position: "absolute",
                              left: "8px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              height: "14px",
                              width: "14px",
                              color: "#9ca3af",
                            }}
                          />
                          <input
                            type="text"
                            placeholder={t("admin.menuManagement.sizePricePlaceholder")}
                            value={sizePriceInputs[index] !== undefined ? sizePriceInputs[index] : (size.price !== null && size.price !== undefined && size.price !== 0 ? formatNumberForInput(size.price) : "")}
                            onChange={(e) => handleSizePriceChange(index, e)}
                            style={{
                              width: "180px",
                              padding: "8px 12px 8px 28px",
                              fontSize: "14px",
                              border: "1px solid #e5e7eb",
                              borderRadius: "6px",
                              outline: "none",
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = "#ec4899";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = "#e5e7eb";
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSize(index)}
                          style={{
                            padding: "8px",
                            border: "none",
                            backgroundColor: "#fee2e2",
                            borderRadius: "6px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#fecaca";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#fee2e2";
                          }}
                        >
                          <X style={{ height: "16px", width: "16px", color: "#dc2626" }} />
                        </button>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder={t("admin.menuManagement.taxPercentPlaceholder")}
                        value={size.taxPercentage !== null && size.taxPercentage !== undefined ? size.taxPercentage : ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "") {
                            updateSize(index, "taxPercentage", null);
                          } else {
                            const numValue = parseFloat(value);
                            if (!isNaN(numValue)) {
                              updateSize(index, "taxPercentage", numValue);
                            }
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "6px 12px",
                          fontSize: "12px",
                          border: "1px solid #e5e7eb",
                          borderRadius: "6px",
                          outline: "none",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={showEditAddons}
                      onChange={(e) => setShowEditAddons(e.target.checked)}
                      style={{
                        width: "16px",
                        height: "16px",
                        cursor: "pointer",
                        accentColor: "#ec4899",
                      }}
                    />
                    <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", cursor: "pointer" }}>
                      {t("admin.menuManagement.availableAddons")}
                    </label>
                  </div>
                  {formData.categoryId && (
                    <button
                      type="button"
                      onClick={selectAllCategoryAddons}
                      disabled={isSubmitting}
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: "500",
                        border: "1px solid #e5e7eb",
                        borderRadius: "6px",
                        backgroundColor: "#ffffff",
                        color: "#111827",
                        cursor: isSubmitting ? "not-allowed" : "pointer",
                        opacity: isSubmitting ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSubmitting) {
                          e.currentTarget.style.backgroundColor = "#f9fafb";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSubmitting) {
                          e.currentTarget.style.backgroundColor = "#ffffff";
                        }
                      }}
                    >
                      {t("admin.menuManagement.selectAllCategoryAddons")}
                    </button>
                  )}
                </div>
                {formData.categoryId && (() => {
                  const selectedCategory = categories.find(cat => cat.id === formData.categoryId);
                  return selectedCategory ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", marginTop: "8px" }}>
                      <input
                        type="checkbox"
                        checked={filterAddonsByCategory}
                        onChange={(e) => setFilterAddonsByCategory(e.target.checked)}
                        disabled={!formData.categoryId}
                        style={{
                          width: "16px",
                          height: "16px",
                          cursor: formData.categoryId ? "pointer" : "not-allowed",
                          accentColor: "#ec4899",
                          opacity: formData.categoryId ? 1 : 0.5,
                        }}
                      />
                      <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", cursor: formData.categoryId ? "pointer" : "not-allowed", opacity: formData.categoryId ? 1 : 0.5 }}>
                        {t("admin.menuManagement.showCategoryAddons", { categoryName: selectedCategory.name })}
                      </label>
                    </div>
                  ) : null;
                })()}
                <input
                  type="text"
                  placeholder={t("admin.menuManagement.searchAddons")}
                  value={addonSearchTerm}
                  onChange={(e) => setAddonSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    marginBottom: "12px",
                  }}
                />
                <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "8px" }}>
                  {filteredAddons.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#6b7280", textAlign: "center", padding: "16px" }}>
                      {addonSearchTerm ? t("admin.menuManagement.noAddonsMatch") : t("admin.menuManagement.noAddonsAvailable")}
                    </p>
                  ) : (
                    filteredAddons.map((addon) => (
                      <div
                        key={addon.id}
                        onClick={() => toggleAddon(addon.id)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          marginBottom: "4px",
                          backgroundColor: formData.addOnIds?.includes(addon.id) ? "#fce7f3" : "transparent",
                          border: formData.addOnIds?.includes(addon.id) ? "1px solid #ec4899" : "1px solid transparent",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                        onMouseEnter={(e) => {
                          if (!formData.addOnIds?.includes(addon.id)) {
                            e.currentTarget.style.backgroundColor = "#f9fafb";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!formData.addOnIds?.includes(addon.id)) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                            {addon.name}
                          </div>
                          <div style={{ fontSize: "12px", color: "#6b7280" }}>
                            {formatPrice(parsePrice(addon.price ?? "0"), "USD")} • {addon.type}
                          </div>
                        </div>
                        {formData.addOnIds?.includes(addon.id) && (
                          <Check style={{ height: "16px", width: "16px", color: "#ec4899" }} />
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", marginTop: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                      {t("admin.menuManagement.selectedAddons")}
                    </p>
                    <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0 0" }}>
                      {t("admin.menuManagement.addonsSelected", { count: formData.addOnIds?.length || 0 })}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <input
                    type="checkbox"
                    checked={showEditDeclarations}
                    onChange={(e) => setShowEditDeclarations(e.target.checked)}
                    style={{
                      width: "16px",
                      height: "16px",
                      cursor: "pointer",
                      accentColor: "#ec4899",
                    }}
                  />
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", cursor: "pointer" }}>
                    {t("admin.menuManagement.availableDeclarations")}
                  </label>
                </div>
                <input
                  type="text"
                  placeholder={t("admin.menuManagement.searchDeclarations")}
                  value={declarationSearchTerm}
                  onChange={(e) => setDeclarationSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    marginBottom: "12px",
                  }}
                />
                <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "8px" }}>
                  {filteredDeclarations.map((declaration) => (
                    <div
                      key={declaration.id}
                      onClick={() => toggleDeclaration(declaration.id)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "6px",
                        cursor: "pointer",
                        marginBottom: "4px",
                        backgroundColor: formData.declarationIds?.includes(declaration.id) ? "#fce7f3" : "transparent",
                        border: formData.declarationIds?.includes(declaration.id) ? "1px solid #ec4899" : "1px solid transparent",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) => {
                        if (!formData.declarationIds?.includes(declaration.id)) {
                          e.currentTarget.style.backgroundColor = "#f9fafb";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!formData.declarationIds?.includes(declaration.id)) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {declaration.icon && <span style={{ fontSize: "18px" }}>{declaration.icon}</span>}
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                            {declaration.name}
                          </div>
                          {declaration.type && (
                            <div style={{ fontSize: "12px", color: "#6b7280" }}>{declaration.type}</div>
                          )}
                        </div>
                      </div>
                      {formData.declarationIds?.includes(declaration.id) && (
                        <Check style={{ height: "16px", width: "16px", color: "#ec4899" }} />
                      )}
                    </div>
                  ))}
                  {filteredDeclarations.length === 0 && (
                    <p style={{ fontSize: "12px", color: "#6b7280", textAlign: "center", padding: "16px" }}>
                      {declarationSearchTerm ? t("admin.menuManagement.noDeclarationsMatch") : t("admin.menuManagement.noDeclarationsAvailable")}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", marginTop: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                      {t("admin.menuManagement.selectedDeclarations")}
                    </p>
                    <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0 0" }}>
                      {t("admin.menuManagement.declarationsSelected", { count: formData.declarationIds?.length || 0 })}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <input
                    type="checkbox"
                    checked={showEditOptionalIngredients}
                    onChange={(e) => setShowEditOptionalIngredients(e.target.checked)}
                    style={{
                      width: "16px",
                      height: "16px",
                      cursor: "pointer",
                      accentColor: "#ec4899",
                    }}
                  />
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", cursor: "pointer" }}>
                    {t("admin.menuManagement.availableOptionalIngredients")}
                  </label>
                </div>
                <input
                  type="text"
                  placeholder={t("admin.menuManagement.searchOptionalIngredients")}
                  value={optionalIngredientSearchTerm}
                  onChange={(e) => setOptionalIngredientSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    marginBottom: "12px",
                  }}
                />
                <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "8px" }}>
                  {filteredOptionalIngredients.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#6b7280", textAlign: "center", padding: "16px" }}>
                      {optionalIngredientSearchTerm ? t("admin.menuManagement.noOptionalIngredientsMatch") : t("admin.menuManagement.noOptionalIngredientsAvailable")}
                    </p>
                  ) : (
                    filteredOptionalIngredients.map((ingredient) => (
                      <div
                        key={ingredient.id}
                        onClick={() => toggleOptionalIngredient(ingredient.id)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          marginBottom: "4px",
                          backgroundColor: formData.optionalIngredientIds?.includes(ingredient.id) ? "#fce7f3" : "transparent",
                          border: formData.optionalIngredientIds?.includes(ingredient.id) ? "1px solid #ec4899" : "1px solid transparent",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                        onMouseEnter={(e) => {
                          if (!formData.optionalIngredientIds?.includes(ingredient.id)) {
                            e.currentTarget.style.backgroundColor = "#f9fafb";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!formData.optionalIngredientIds?.includes(ingredient.id)) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                            {ingredient.name}
                          </div>
                          {ingredient.description && (
                            <div style={{ fontSize: "12px", color: "#6b7280" }}>{ingredient.description}</div>
                          )}
                        </div>
                        {formData.optionalIngredientIds?.includes(ingredient.id) && (
                          <Check style={{ height: "16px", width: "16px", color: "#ec4899" }} />
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", marginTop: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                      {t("admin.menuManagement.selectedOptionalIngredients")}
                    </p>
                    <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0 0" }}>
                      {t("admin.menuManagement.optionalIngredientsSelected", { count: formData.optionalIngredientIds?.length || 0 })}
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                <button
                  type="button"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isSubmitting}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    backgroundColor: "#ffffff",
                    cursor: "pointer",
                    color: "#111827",
                    opacity: isSubmitting ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.backgroundColor = "#f9fafb";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.backgroundColor = "#ffffff";
                    }
                  }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
                    border: "none",
                    borderRadius: "6px",
                    backgroundColor: "#ec4899",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    color: "#ffffff",
                    opacity: isSubmitting ? 0.5 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.backgroundColor = "#db2777";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.backgroundColor = "#ec4899";
                    }
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} />
                      {t("admin.menuManagement.creating")}
                    </>
                  ) : (
                    t("admin.menuManagement.createMeal")
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteBranchPriceDialogOpen && branchPriceToDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "24px",
          }}
          onClick={() => {
            setIsDeleteBranchPriceDialogOpen(false);
            setBranchPriceToDelete(null);
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "420px",
              width: "100%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#111827", marginBottom: "8px" }}>
              {t("admin.menuManagement.deleteBranchPriceTitle", { defaultValue: "Delete branch price" })}
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "20px" }}>
              {t("admin.menuManagement.deleteBranchPriceDescription", {
                defaultValue: "Are you sure you want to delete the branch-specific price for {{branchName}}?",
                branchName: branchPriceToDelete.branchName,
              })}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteBranchPriceDialogOpen(false);
                  setBranchPriceToDelete(null);
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleDeleteBranchPrice}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #dc2626",
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Meal Dialog */}
      {isEditDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "24px",
          }}
          onClick={() => setIsEditDialogOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "900px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  color: "#111827",
                }}
              >
                {t("admin.menuManagement.editMealTitle")}
              </h3>
              <button
                onClick={() => setIsEditDialogOpen(false)}
                style={{
                  padding: "4px",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  borderRadius: "4px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <XCircle style={{ height: "20px", width: "20px", color: "#6b7280" }} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                    {t("admin.menuManagement.mealNameRequired")}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      outline: "none",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#ec4899";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                    {t("admin.menuManagement.basePriceRequired")}
                  </label>
                  <div style={{ position: "relative" }}>
                    <DollarSign
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        height: "16px",
                        width: "16px",
                        color: "#9ca3af",
                      }}
                    />
                    <input
                      type="text"
                      value={basePriceInput}
                      onChange={handleBasePriceChange}
                      placeholder={t("admin.menuManagement.basePriceRequired")}
                      required
                      disabled={isSubmitting}
                      style={{
                        width: "100%",
                        padding: "8px 12px 8px 36px",
                        fontSize: "14px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "6px",
                        outline: "none",
                        backgroundColor: isSubmitting ? "#f9fafb" : "#ffffff",
                        color: "#111827",
                      }}
                      onFocus={(e) => {
                        if (!isSubmitting) {
                          e.currentTarget.style.borderColor = "#ec4899";
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                  {t("admin.menuManagement.taxPercentage")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.taxPercentage !== null && formData.taxPercentage !== undefined ? formData.taxPercentage : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "") {
                      setFormData({
                        ...formData,
                        taxPercentage: null,
                      });
                    } else {
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue)) {
                        setFormData({
                          ...formData,
                          taxPercentage: numValue,
                        });
                      }
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#111827" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.isFeatured)}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                    disabled={isSubmitting}
                    style={{ width: "16px", height: "16px", accentColor: "#ec4899" }}
                  />
                  {t("admin.menuManagement.isFeatured", { defaultValue: "Featured" })}
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#111827" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.isDrink)}
                    onChange={(e) => setFormData({ ...formData, isDrink: e.target.checked })}
                    disabled={isSubmitting}
                    style={{ width: "16px", height: "16px", accentColor: "#ec4899" }}
                  />
                  {t("admin.menuManagement.isDrink", { defaultValue: "Drink" })}
                </label>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
                  {t("admin.menuManagement.excludedBranches", { defaultValue: "Excluded branches" })}
                </label>
                <p style={{ fontSize: "12px", color: "#6b7280", marginTop: 0 }}>
                  {t("admin.menuManagement.excludedBranchesDescription", {
                    defaultValue: "This meal will not be available in the selected branches.",
                  })}
                </p>

                <div
                  style={{
                    maxHeight: "200px",
                    overflowY: "auto",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    padding: "8px",
                  }}
                >
                  {branches.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#6b7280", textAlign: "center", padding: "16px" }}>
                      {t("admin.menuManagement.noBranchesAvailable", { defaultValue: "No branches available" })}
                    </p>
                  ) : (
                    branches.map((branch) => {
                      const isExcluded = formData.excludedBranches?.includes(branch.id);
                      return (
                        <div
                          key={branch.id}
                          onClick={() => toggleExcludedBranch(branch.id)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            marginBottom: "4px",
                            backgroundColor: isExcluded ? "#fce7f3" : "transparent",
                            border: isExcluded ? "1px solid #ec4899" : "1px solid transparent",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                          onMouseEnter={(e) => {
                            if (!isExcluded) {
                              e.currentTarget.style.backgroundColor = "#f9fafb";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isExcluded) {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }
                          }}
                        >
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>{branch.name}</div>
                          {isExcluded && <Check style={{ height: "16px", width: "16px", color: "#ec4899" }} />}
                        </div>
                      );
                    })
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px",
                    backgroundColor: "#f9fafb",
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                    marginTop: "12px",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                      {t("admin.menuManagement.excludedBranches", { defaultValue: "Excluded branches" })}
                    </p>
                    <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0 0" }}>
                      {t("admin.menuManagement.branchesExcluded", {
                        defaultValue: "{{count}} branch(es) excluded",
                        count: formData.excludedBranches?.length || 0,
                      })}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
                  {t("admin.menuManagement.branchPricesTitle", { defaultValue: "Branch-specific prices" })}
                </label>
                <p style={{ fontSize: "12px", color: "#6b7280", marginTop: 0 }}>
                  {t("admin.menuManagement.branchPricesDescription", {
                    defaultValue: "Override base price (and optionally tax) for specific branches.",
                  })}
                </p>

                {loadingBranchPrices ? (
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>
                    {t("admin.menuManagement.branchPricesLoading", { defaultValue: "Loading branch prices..." })}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {branchPrices.length === 0 ? (
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>
                        {t("admin.menuManagement.branchPricesEmpty", {
                          defaultValue: "No branch-specific prices set.",
                        })}
                      </div>
                    ) : (
                      branchPrices.map((bp) => (
                        <div
                          key={bp.id}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: "10px",
                            padding: "10px 12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>{bp.branch.name}</div>
                            <div style={{ fontSize: "12px", color: "#6b7280" }}>
                              {t("admin.menuManagement.branchPriceLabel", {
                                defaultValue: "Price: {{price}}",
                                price: formatPrice(parsePrice(bp.basePrice), "USD"),
                              })}
                              {" "}
                              {bp.taxPercentage !== null && bp.taxPercentage !== undefined
                                ? t("admin.menuManagement.branchTaxLabel", {
                                    defaultValue: "Tax: {{tax}}%",
                                    tax: bp.taxPercentage,
                                  })
                                : t("admin.menuManagement.branchTaxLabelNone", {
                                    defaultValue: "Tax: default",
                                  })}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingBranchPrice({
                                  branchId: bp.branchId,
                                  basePrice: String(parsePrice(bp.basePrice)),
                                  taxPercentage:
                                    bp.taxPercentage !== null && bp.taxPercentage !== undefined
                                      ? String(bp.taxPercentage)
                                      : "",
                                })
                              }
                              style={{
                                padding: "8px 10px",
                                borderRadius: "8px",
                                border: "1px solid #e5e7eb",
                                backgroundColor: "#ffffff",
                                cursor: "pointer",
                                fontWeight: 700,
                                fontSize: "12px",
                              }}
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                formData.id &&
                                handleDeleteBranchPriceClick(formData.id, bp.branchId, bp.branch.name)
                              }
                              style={{
                                padding: "8px 10px",
                                borderRadius: "8px",
                                border: "1px solid #fecaca",
                                backgroundColor: "#fee2e2",
                                cursor: "pointer",
                                fontWeight: 800,
                                fontSize: "12px",
                                color: "#991b1b",
                              }}
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        </div>
                      ))
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingBranchPrice({
                            branchId: branches[0]?.id || "",
                            basePrice: "",
                            taxPercentage: "",
                          })
                        }
                        disabled={branches.length === 0}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "10px",
                          border: "1px solid #e5e7eb",
                          backgroundColor: "#ffffff",
                          cursor: branches.length === 0 ? "not-allowed" : "pointer",
                          fontWeight: 800,
                          fontSize: "12px",
                        }}
                      >
                        {t("admin.menuManagement.addBranchPrice", { defaultValue: "Add branch price" })}
                      </button>
                    </div>
                  </div>
                )}

                {editingBranchPrice && (
                  <div style={{ marginTop: "12px", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
                          {t("admin.menuManagement.branchPriceBranch", { defaultValue: "Branch" })}
                        </label>
                        <OrganizationSearchSelect
                          organizations={branches
                            .filter(
                              (b) =>
                                !branchPrices.some(
                                  (bp) =>
                                    bp.branchId === b.id && bp.branchId !== editingBranchPrice.branchId
                                )
                            )
                            .map((b) => ({ id: b.id, name: b.name }))}
                          value={editingBranchPrice.branchId}
                          onValueChange={(value) =>
                            setEditingBranchPrice({
                              ...editingBranchPrice,
                              branchId: value,
                            })
                          }
                          placeholder={t("admin.menuManagement.selectBranch", { defaultValue: "Select branch" })}
                          searchPlaceholder={t("admin.menuManagement.searchBranches", { defaultValue: "Search branches..." })}
                          noResultsText={t("admin.menuManagement.noBranchesFound", { defaultValue: "No branches found" })}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
                          {t("admin.menuManagement.branchPriceBasePrice", { defaultValue: "Base price" })}
                        </label>
                        <input
                          type="text"
                          value={editingBranchPrice.basePrice}
                          onChange={(e) =>
                            setEditingBranchPrice({
                              ...editingBranchPrice,
                              basePrice: e.target.value,
                            })
                          }
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            fontSize: "14px",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: "12px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
                        {t("admin.menuManagement.branchPriceTax", { defaultValue: "Tax percentage (optional)" })}
                      </label>
                      <input
                        type="text"
                        value={editingBranchPrice.taxPercentage}
                        onChange={(e) =>
                          setEditingBranchPrice({
                            ...editingBranchPrice,
                            taxPercentage: e.target.value,
                          })
                        }
                        placeholder={t("admin.menuManagement.taxPercentagePlaceholder")}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          fontSize: "14px",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                      <button
                        type="button"
                        onClick={() => setEditingBranchPrice(null)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "10px",
                          border: "1px solid #e5e7eb",
                          backgroundColor: "#ffffff",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveBranchPrice}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "10px",
                          border: "1px solid #ec4899",
                          backgroundColor: "#ec4899",
                          color: "#ffffff",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        {t("common.save")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                  {t("admin.menuManagement.descriptionLabel")}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    resize: "vertical",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                  {t("admin.menuManagement.categoryRequired")}
                </label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    cursor: "pointer",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                >
                  <option value="">{t("admin.menuManagement.selectCategory")}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "6px" }}>
                  {t("admin.menuManagement.mealImage")}
                </label>
                <ImageUpload
                  key={`edit-${formData.id || 'new'}-${formData.image || 'no-image'}`}
                  value={formData.image}
                  onChange={(value) => setFormData({ ...formData, image: value || undefined })}
                  showPlaceholder={isEditDialogOpen && !formData.image}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                    {t("admin.menuManagement.mealSizes")}
                  </label>
                  <button
                    type="button"
                    onClick={addSize}
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      backgroundColor: "#ffffff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#ffffff";
                    }}
                  >
                    <Plus style={{ height: "14px", width: "14px" }} />
                    {t("admin.menuManagement.addSize")}
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {formData.sizes?.map((size, index) => (
                    <div key={index} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="text"
                          placeholder={t("admin.menuManagement.sizeNamePlaceholder")}
                          value={size.name}
                          onChange={(e) => updateSize(index, "name", e.target.value)}
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            fontSize: "14px",
                            border: "1px solid #e5e7eb",
                            borderRadius: "6px",
                            outline: "none",
                          }}
                        />
                        <div style={{ position: "relative" }}>
                          <DollarSign
                            style={{
                              position: "absolute",
                              left: "8px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              height: "14px",
                              width: "14px",
                              color: "#9ca3af",
                            }}
                          />
                          <input
                            type="text"
                            placeholder={t("admin.menuManagement.sizePricePlaceholder")}
                            value={sizePriceInputs[index] !== undefined ? sizePriceInputs[index] : (size.price !== null && size.price !== undefined && size.price !== 0 ? formatNumberForInput(size.price) : "")}
                            onChange={(e) => handleSizePriceChange(index, e)}
                            style={{
                              width: "180px",
                              padding: "8px 12px 8px 28px",
                              fontSize: "14px",
                              border: "1px solid #e5e7eb",
                              borderRadius: "6px",
                              outline: "none",
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = "#ec4899";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = "#e5e7eb";
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSize(index)}
                          style={{
                            padding: "8px",
                            border: "none",
                            backgroundColor: "#fee2e2",
                            borderRadius: "6px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#fecaca";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#fee2e2";
                          }}
                        >
                          <X style={{ height: "16px", width: "16px", color: "#dc2626" }} />
                        </button>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder={t("admin.menuManagement.taxPercentPlaceholder")}
                        value={size.taxPercentage !== null && size.taxPercentage !== undefined ? size.taxPercentage : ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "") {
                            updateSize(index, "taxPercentage", null);
                          } else {
                            const numValue = parseFloat(value);
                            if (!isNaN(numValue)) {
                              updateSize(index, "taxPercentage", numValue);
                            }
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "6px 12px",
                          fontSize: "12px",
                          border: "1px solid #e5e7eb",
                          borderRadius: "6px",
                          outline: "none",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={showEditAddons}
                      onChange={(e) => setShowEditAddons(e.target.checked)}
                      style={{
                        width: "16px",
                        height: "16px",
                        cursor: "pointer",
                        accentColor: "#ec4899",
                      }}
                    />
                    <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", cursor: "pointer" }}>
                      {t("admin.menuManagement.availableAddons")}
                    </label>
                  </div>
                  {formData.categoryId && (
                    <button
                      type="button"
                      onClick={selectAllCategoryAddons}
                      disabled={isSubmitting}
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: "500",
                        border: "1px solid #e5e7eb",
                        borderRadius: "6px",
                        backgroundColor: "#ffffff",
                        color: "#111827",
                        cursor: isSubmitting ? "not-allowed" : "pointer",
                        opacity: isSubmitting ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSubmitting) {
                          e.currentTarget.style.backgroundColor = "#f9fafb";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSubmitting) {
                          e.currentTarget.style.backgroundColor = "#ffffff";
                        }
                      }}
                    >
                      {t("admin.menuManagement.selectAllCategoryAddons")}
                    </button>
                  )}
                </div>
                {formData.categoryId && (() => {
                  const selectedCategory = categories.find(cat => cat.id === formData.categoryId);
                  return selectedCategory ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", marginTop: "8px" }}>
                      <input
                        type="checkbox"
                        checked={filterAddonsByCategory}
                        onChange={(e) => setFilterAddonsByCategory(e.target.checked)}
                        disabled={!formData.categoryId}
                        style={{
                          width: "16px",
                          height: "16px",
                          cursor: formData.categoryId ? "pointer" : "not-allowed",
                          accentColor: "#ec4899",
                          opacity: formData.categoryId ? 1 : 0.5,
                        }}
                      />
                      <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", cursor: formData.categoryId ? "pointer" : "not-allowed", opacity: formData.categoryId ? 1 : 0.5 }}>
                        {t("admin.menuManagement.showCategoryAddons", { categoryName: selectedCategory.name })}
                      </label>
                    </div>
                  ) : null;
                })()}
                <input
                  type="text"
                  placeholder={t("admin.menuManagement.searchAddons")}
                  value={addonSearchTerm}
                  onChange={(e) => setAddonSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    marginBottom: "12px",
                  }}
                />
                <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "8px" }}>
                  {filteredAddons.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#6b7280", textAlign: "center", padding: "16px" }}>
                      {addonSearchTerm ? t("admin.menuManagement.noAddonsMatch") : t("admin.menuManagement.noAddonsAvailable")}
                    </p>
                  ) : (
                    filteredAddons.map((addon) => (
                      <div
                        key={addon.id}
                        onClick={() => toggleAddon(addon.id)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          marginBottom: "4px",
                          backgroundColor: formData.addOnIds?.includes(addon.id) ? "#fce7f3" : "transparent",
                          border: formData.addOnIds?.includes(addon.id) ? "1px solid #ec4899" : "1px solid transparent",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                        onMouseEnter={(e) => {
                          if (!formData.addOnIds?.includes(addon.id)) {
                            e.currentTarget.style.backgroundColor = "#f9fafb";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!formData.addOnIds?.includes(addon.id)) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                            {addon.name}
                          </div>
                          <div style={{ fontSize: "12px", color: "#6b7280" }}>
                            {formatPrice(parsePrice(addon.price ?? "0"), "USD")} • {addon.type}
                          </div>
                        </div>
                        {formData.addOnIds?.includes(addon.id) && (
                          <Check style={{ height: "16px", width: "16px", color: "#ec4899" }} />
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", marginTop: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                      {t("admin.menuManagement.selectedAddons")}
                    </p>
                    <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0 0" }}>
                      {t("admin.menuManagement.addonsSelected", { count: formData.addOnIds?.length || 0 })}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <input
                    type="checkbox"
                    checked={showEditDeclarations}
                    onChange={(e) => setShowEditDeclarations(e.target.checked)}
                    style={{
                      width: "16px",
                      height: "16px",
                      cursor: "pointer",
                      accentColor: "#ec4899",
                    }}
                  />
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", cursor: "pointer" }}>
                    {t("admin.menuManagement.availableDeclarations")}
                  </label>
                </div>
                <input
                  type="text"
                  placeholder={t("admin.menuManagement.searchDeclarations")}
                  value={declarationSearchTerm}
                  onChange={(e) => setDeclarationSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    marginBottom: "12px",
                  }}
                />
                <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "8px" }}>
                  {filteredDeclarations.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#6b7280", textAlign: "center", padding: "16px" }}>
                      {declarationSearchTerm ? t("admin.menuManagement.noDeclarationsMatch") : t("admin.menuManagement.noDeclarationsAvailable")}
                    </p>
                  ) : (
                    filteredDeclarations.map((declaration) => (
                      <div
                        key={declaration.id}
                        onClick={() => toggleDeclaration(declaration.id)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          marginBottom: "4px",
                          backgroundColor: formData.declarationIds?.includes(declaration.id) ? "#fce7f3" : "transparent",
                          border: formData.declarationIds?.includes(declaration.id) ? "1px solid #ec4899" : "1px solid transparent",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                        onMouseEnter={(e) => {
                          if (!formData.declarationIds?.includes(declaration.id)) {
                            e.currentTarget.style.backgroundColor = "#f9fafb";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!formData.declarationIds?.includes(declaration.id)) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {declaration.icon && <span style={{ fontSize: "18px" }}>{declaration.icon}</span>}
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                              {declaration.name}
                            </div>
                            {declaration.type && (
                              <div style={{ fontSize: "12px", color: "#6b7280" }}>{declaration.type}</div>
                            )}
                          </div>
                        </div>
                        {formData.declarationIds?.includes(declaration.id) && (
                          <Check style={{ height: "16px", width: "16px", color: "#ec4899" }} />
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", marginTop: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                      {t("admin.menuManagement.selectedDeclarations")}
                    </p>
                    <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0 0" }}>
                      {t("admin.menuManagement.declarationsSelected", { count: formData.declarationIds?.length || 0 })}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <input
                    type="checkbox"
                    checked={showEditOptionalIngredients}
                    onChange={(e) => setShowEditOptionalIngredients(e.target.checked)}
                    style={{
                      width: "16px",
                      height: "16px",
                      cursor: "pointer",
                      accentColor: "#ec4899",
                    }}
                  />
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", cursor: "pointer" }}>
                    {t("admin.menuManagement.availableOptionalIngredients")}
                  </label>
                </div>
                <input
                  type="text"
                  placeholder={t("admin.menuManagement.searchOptionalIngredients")}
                  value={optionalIngredientSearchTerm}
                  onChange={(e) => setOptionalIngredientSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    outline: "none",
                    marginBottom: "12px",
                  }}
                />
                <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "8px" }}>
                  {filteredOptionalIngredients.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#6b7280", textAlign: "center", padding: "16px" }}>
                      {optionalIngredientSearchTerm ? t("admin.menuManagement.noOptionalIngredientsMatch") : t("admin.menuManagement.noOptionalIngredientsAvailable")}
                    </p>
                  ) : (
                    filteredOptionalIngredients.map((ingredient) => (
                      <div
                        key={ingredient.id}
                        onClick={() => toggleOptionalIngredient(ingredient.id)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          marginBottom: "4px",
                          backgroundColor: formData.optionalIngredientIds?.includes(ingredient.id) ? "#fce7f3" : "transparent",
                          border: formData.optionalIngredientIds?.includes(ingredient.id) ? "1px solid #ec4899" : "1px solid transparent",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                        onMouseEnter={(e) => {
                          if (!formData.optionalIngredientIds?.includes(ingredient.id)) {
                            e.currentTarget.style.backgroundColor = "#f9fafb";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!formData.optionalIngredientIds?.includes(ingredient.id)) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                            {ingredient.name}
                          </div>
                          {ingredient.description && (
                            <div style={{ fontSize: "12px", color: "#6b7280" }}>{ingredient.description}</div>
                          )}
                        </div>
                        {formData.optionalIngredientIds?.includes(ingredient.id) && (
                          <Check style={{ height: "16px", width: "16px", color: "#ec4899" }} />
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", marginTop: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                      {t("admin.menuManagement.selectedOptionalIngredients")}
                    </p>
                    <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0 0" }}>
                      {t("admin.menuManagement.optionalIngredientsSelected", { count: formData.optionalIngredientIds?.length || 0 })}
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                <button
                  type="button"
                  onClick={() => setIsEditDialogOpen(false)}
                  disabled={isSubmitting}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    backgroundColor: "#ffffff",
                    cursor: "pointer",
                    color: "#111827",
                    opacity: isSubmitting ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.backgroundColor = "#f9fafb";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.backgroundColor = "#ffffff";
                    }
                  }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
                    border: "none",
                    borderRadius: "6px",
                    backgroundColor: "#ec4899",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    color: "#ffffff",
                    opacity: isSubmitting ? 0.5 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.backgroundColor = "#db2777";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.backgroundColor = "#ec4899";
                    }
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} />
                      {t("admin.menuManagement.updating")}
                    </>
                  ) : (
                    t("admin.menuManagement.updateMeal")
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default MealManagement;

