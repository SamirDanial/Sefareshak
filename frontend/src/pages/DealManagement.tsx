import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Icon from "@mdi/react";
import {
  mdiPackageVariant,
  mdiPlus,
  mdiMagnify,
  mdiDotsVertical,
  mdiPencil,
  mdiDelete,
  mdiEye,
  mdiEyeOff,
  mdiChevronLeft,
  mdiChevronRight,
  mdiRefresh,
  mdiSort,
  mdiClose,
  mdiFormatListNumbered,
} from "@mdi/js";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { dealService, type Deal, type DealFormData, type DealComponent } from "@/services/dealService";
import { categoryService, type Category } from "@/services/categoryService";
import { addonService, type Addon } from "@/services/addonService";
import { declarationService, type Declaration } from "@/services/declarationService";
import { optionalIngredientService, type OptionalIngredient } from "@/services/optionalIngredientService";
import branchService, { type Branch } from "@/services/branchService";
import ImageUpload from "@/components/ui/image-upload";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import PriceInput from "@/components/ui/PriceInput";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useSearchParams } from "react-router-dom";

const DealManagement: React.FC = () => {
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const { canAny } = usePermissions();
  const { settings } = useSettings();
  const currency = settings?.currency || "EUR";

  const [searchParams, setSearchParams] = useSearchParams();

  // List state
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedActiveStatus, setSelectedActiveStatus] = useState<string>("all");
  const [openDealMenuId, setOpenDealMenuId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [categorySearchTerm, setCategorySearchTerm] = useState("");
  const [showEmptyCategories, setShowEmptyCategories] = useState(false);

  // Reference data
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [optionalIngredients, setOptionalIngredients] = useState<OptionalIngredient[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [dealToDelete, setDealToDelete] = useState<Deal | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isDeclarationsDialogOpen, setIsDeclarationsDialogOpen] = useState(false);
  const [isOptionalIngredientsDialogOpen, setIsOptionalIngredientsDialogOpen] = useState(false);
  const [declarationSearchTerm, setDeclarationSearchTerm] = useState("");
  const [optionalIngredientSearchTerm, setOptionalIngredientSearchTerm] = useState("");

  const [dealDialogTab, setDealDialogTab] = useState<"basics" | "components" | "availability" | "addons">(
    "basics"
  );

  // Form state
  const [formData, setFormData] = useState<DealFormData>({
    name: "",
    nameFa: "",
    description: "",
    image: "",
    categoryId: "",
    categoryNameFa: "",
    excludedBranches: [],
    isActive: true,
    isFeatured: false,
    components: [],
    addOnIds: [],
    declarationIds: [],
    optionalIngredientIds: [],
  });

  // Component price inputs (for controlled input)
  const [componentPriceInputs, setComponentPriceInputs] = useState<Record<number, string>>({});
  const [componentTaxInputs, setComponentTaxInputs] = useState<Record<number, string>>({});

  // Permissions
  const canCreateDeal = canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.CREATE }]);
  const canUpdateDeal = canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.UPDATE }]);
  const canDeleteDeal = canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.DELETE }]);
  const canToggleDeal = canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.TOGGLE_ACTIVE }]);

  const canDealCategoryOrdering = canAny([
    { resource: RESOURCES.CATEGORIES, action: ACTIONS.ORDERING },
  ]);

  const canReorderCategoryDeals = canAny([
    { resource: RESOURCES.DEALS, action: ACTIONS.REORDER_CATEGORY },
  ]);

  const canReorderFeaturedDeals = canAny([
    { resource: RESOURCES.DEALS, action: ACTIONS.REORDER_FEATURED },
  ]);

  const canManageDealOrdering =
    canDealCategoryOrdering && canReorderCategoryDeals && canReorderFeaturedDeals;

  // Fetch deals
  const fetchDeals = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const statusParam =
        selectedActiveStatus === "true"
          ? "ACTIVE"
          : selectedActiveStatus === "false"
          ? "INACTIVE"
          : "";
      const response = await dealService.getDeals(
        currentPage,
        10,
        searchTerm,
        sortBy,
        sortOrder,
        selectedCategoryId,
        token || undefined,
        { status: statusParam }
      );
      setDeals(response.deals);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error fetching deals:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch categories
  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true);
      const token = await getToken();
      const response = await categoryService.getCategories(1, 100, "", "name", "asc", token || undefined);
      setCategories(response.categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setCategoriesLoading(false);
    }
  };

  // Fetch branches
  const fetchBranches = async () => {
    try {
      const token = await getToken();
      const branchesData = await branchService.getBranches(token || undefined);
      setBranches(branchesData || []);
    } catch (error) {
      console.error("Error fetching branches:", error);
    }
  };

  // Fetch addons
  const fetchAddons = async () => {
    try {
      const token = await getToken();
      const response = await addonService.getAddons(1, 100, "", "name", "asc", token || undefined);
      setAddons(response.addons);
    } catch (error) {
      console.error("Error fetching addons:", error);
    }
  };

  const fetchDeclarations = async () => {
    try {
      const token = await getToken();
      const data = await declarationService.getAllDeclarations(undefined, token || undefined);
      setDeclarations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching declarations:", error);
      setDeclarations([]);
    }
  };

  const fetchOptionalIngredients = async () => {
    try {
      const token = await getToken();
      const data = await optionalIngredientService.getAllOptionalIngredients(token || undefined);
      setOptionalIngredients(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching optional ingredients:", error);
      setOptionalIngredients([]);
    }
  };

  useEffect(() => {
    if (!selectedCategoryId) return;
    fetchDeals();
  }, [currentPage, searchTerm, sortBy, sortOrder, selectedActiveStatus, selectedCategoryId]);

  useEffect(() => {
    const urlCategoryId = searchParams.get("categoryId") || "";
    if (urlCategoryId !== selectedCategoryId) {
      setSelectedCategoryId(urlCategoryId);
      setCurrentPage(1);
      setSearchTerm("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    fetchCategories();
    fetchBranches();
    fetchAddons();
    fetchDeclarations();
    fetchOptionalIngredients();
  }, []);

  // Handle search
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setCurrentPage(1);
    setSearchTerm("");
    setSearchParams(categoryId ? { categoryId } : {});
  };

  // Handle sort
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      nameFa: "",
      description: "",
      image: "",
      categoryId: "",
      categoryNameFa: "",
      excludedBranches: [],
      isActive: true,
      isFeatured: false,
      components: [],
      addOnIds: [],
      declarationIds: [],
      optionalIngredientIds: [],
    });
    setComponentPriceInputs({});
    setComponentTaxInputs({});
    setSelectedDeal(null);
    setDeclarationSearchTerm("");
    setOptionalIngredientSearchTerm("");
    setDealDialogTab("basics");
  };

  // Handle create new
  const handleCreateNew = () => {
    resetForm();
    setDealDialogTab("basics");
    setIsCreateDialogOpen(true);
  };

  // Handle edit
  const handleEdit = (deal: Deal) => {
    setSelectedDeal(deal);
    setDealDialogTab("basics");
    const priceInputs: Record<number, string> = {};
    const taxInputs: Record<number, string> = {};
    deal.components.forEach((c, i) => {
      priceInputs[i] = String(c.price);
      taxInputs[i] = String(c.taxPercentage);
    });
    setComponentPriceInputs(priceInputs);
    setComponentTaxInputs(taxInputs);
    setFormData({
      name: deal.name,
      nameFa: (deal as any).nameFa || "",
      description: deal.description || "",
      image: deal.image || "",
      categoryId: deal.categoryId,
      categoryNameFa: (deal as any).categoryNameFa || "",
      excludedBranches: deal.excludedBranches || [],
      isActive: deal.isActive,
      isFeatured: deal.isFeatured || false,
      components: deal.components.map((c) => ({
        id: c.id,
        name: c.name,
        quantity: (c as any).quantity ?? 1,
        price: c.price,
        taxPercentage: c.taxPercentage,
        sortOrder: c.sortOrder,
      })),
      addOnIds: deal.dealAddOns?.map((a) => a.addOn?.id).filter(Boolean) || [],
      declarationIds: deal.dealDeclarations?.map((d) => d.declaration?.id).filter(Boolean) || [],
      optionalIngredientIds:
        deal.dealOptionalIngredients?.map((o) => o.optionalIngredient?.id).filter(Boolean) || [],
    });
    setIsEditDialogOpen(true);
  };

  // Handle delete click
  const handleDeleteClick = (deal: Deal) => {
    setDealToDelete(deal);
    setIsDeleteDialogOpen(true);
  };

  // Handle delete confirm
  const handleDelete = async () => {
    if (!dealToDelete) return;
    try {
      const token = await getToken();
      await dealService.deleteDeal(dealToDelete.id, token || undefined);
      await fetchDeals();
      setIsDeleteDialogOpen(false);
      setDealToDelete(null);
    } catch (error) {
      console.error("Error deleting deal:", error);
    }
  };

  // Handle toggle status
  const handleToggleStatus = async (deal: Deal) => {
    try {
      const token = await getToken();
      await dealService.toggleDealStatus(deal.id, token || undefined);
      await fetchDeals();
    } catch (error) {
      console.error("Error toggling deal status:", error);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.categoryId) {
      alert(t("admin.dealManagement.validation.nameAndCategoryRequired"));
      return;
    }

    const payload: DealFormData = {
      ...formData,
      components: (formData.components || []).map((c: any) => ({
        ...c,
        quantity: (() => {
          const q = Number(c?.quantity);
          return Number.isFinite(q) && q > 0 ? Math.round(q) : 1;
        })(),
      })),
    };
    if (formData.components.length === 0) {
      alert(t("admin.dealManagement.validation.atLeastOneComponentRequired"));
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      if (selectedDeal) {
        await dealService.updateDeal(selectedDeal.id, payload, token || undefined);
      } else {
        await dealService.createDeal(payload, token || undefined);
      }

      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      resetForm();
      await fetchDeals();
    } catch (error) {
      console.error("Error saving deal:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Component management
  const addComponent = () => {
    const newIndex = formData.components.length;
    setFormData({
      ...formData,
      components: [
        ...formData.components,
        { name: "", price: 0, taxPercentage: 0, quantity: 1, sortOrder: newIndex },
      ],
    });
    setComponentPriceInputs({ ...componentPriceInputs, [newIndex]: "" });
    setComponentTaxInputs({ ...componentTaxInputs, [newIndex]: "" });
  };

  const removeComponent = (index: number) => {
    const newComponents = formData.components.filter((_, i) => i !== index);
    setFormData({ ...formData, components: newComponents });
    // Rebuild price/tax inputs
    const newPriceInputs: Record<number, string> = {};
    const newTaxInputs: Record<number, string> = {};
    newComponents.forEach((c, i) => {
      newPriceInputs[i] = String(c.price);
      newTaxInputs[i] = String(c.taxPercentage);
    });
    setComponentPriceInputs(newPriceInputs);
    setComponentTaxInputs(newTaxInputs);
  };

  const updateComponent = (index: number, field: keyof DealComponent, value: any) => {
    const newComponents = [...formData.components];
    newComponents[index] = { ...newComponents[index], [field]: value };
    setFormData({ ...formData, components: newComponents });
  };

  // Toggle excluded branch
  const toggleExcludedBranch = (branchId: string) => {
    const current = formData.excludedBranches || [];
    const newExcluded = current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId];
    setFormData({ ...formData, excludedBranches: newExcluded });
  };

  const toggleDeclaration = (declarationId: string) => {
    const current = formData.declarationIds || [];
    const next = current.includes(declarationId)
      ? current.filter((id) => id !== declarationId)
      : [...current, declarationId];
    setFormData({ ...formData, declarationIds: next });
  };

  const toggleOptionalIngredient = (optionalIngredientId: string) => {
    const current = formData.optionalIngredientIds || [];
    const next = current.includes(optionalIngredientId)
      ? current.filter((id) => id !== optionalIngredientId)
      : [...current, optionalIngredientId];
    setFormData({ ...formData, optionalIngredientIds: next });
  };

  const toNumber = (value: unknown) => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  const filteredDeclarations = declarations.filter((decl) => {
    const q = declarationSearchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      decl.name.toLowerCase().includes(q) ||
      (decl.type || "").toLowerCase().includes(q) ||
      (decl.description || "").toLowerCase().includes(q)
    );
  });

  const filteredOptionalIngredients = optionalIngredients.filter((ing) => {
    const q = optionalIngredientSearchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      ing.name.toLowerCase().includes(q) ||
      (ing.description || "").toLowerCase().includes(q)
    );
  });

  // Calculate deal total price
  const getDealTotalPrice = () => {
    return formData.components.reduce((sum, c) => {
      const price = toNumber((c as any).price);
      const q = toNumber((c as any).quantity);
      const qty = Number.isFinite(q) && q > 0 ? q : 1;
      return sum + price * qty;
    }, 0);
  };

  const visibleDealCategories = useMemo(() => {
    const normalized = categorySearchTerm.trim().toLowerCase();
    const base = categories
      .filter((c) => c.isActive)
      .filter((c) => {
        const dealsCount = c._count?.deals ?? 0;
        const mealsCount = c._count?.meals ?? 0;
        const hasDeals = dealsCount > 0;
        const isEmpty = dealsCount === 0 && mealsCount === 0;

        if (showEmptyCategories) return isEmpty;
        return hasDeals;
      });

    if (!normalized) return base;
    return base.filter((c) => c.name.toLowerCase().includes(normalized));
  }, [categories, categorySearchTerm, showEmptyCategories]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  );

  // Loading state (deals)
  if (selectedCategoryId && loading && deals.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-pink-500">
              {t("admin.dealManagement.title", { defaultValue: "Deal Management" })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("admin.dealManagement.description", { defaultValue: "Manage your deals and special offers." })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canDealCategoryOrdering && (
              <Button
                variant="outline"
                asChild
                className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
              >
                <Link to="/admin/deals/categories/ordering" className="flex items-center">
                  <Icon path={mdiFormatListNumbered} size={0.67} className="mr-2" />
                  {t("admin.dealCategoryOrdering.title", { defaultValue: "Deal Category Ordering" })}
                </Link>
              </Button>
            )}

            {selectedCategoryId && canReorderCategoryDeals && (
              <Button
                variant="outline"
                asChild
                className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
              >
                <Link
                  to={`/admin/deals/categories/${selectedCategoryId}/ordering`}
                  className="flex items-center"
                >
                  <Icon path={mdiFormatListNumbered} size={0.67} className="mr-2" />
                  {t("admin.categoryDealOrdering.cta", { defaultValue: "Order deals" })}
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-pink-500">
            <Icon path={mdiRefresh} size={0.83} className="animate-spin" />
            <span className="text-sm font-medium">{t("common.loading")}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          {selectedCategoryId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit px-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSelectedCategoryId("");
                setDeals([]);
                setTotalCount(0);
                setTotalPages(1);
                setSearchTerm("");
                setCurrentPage(1);
              }}
            >
              <Icon path={mdiChevronLeft} size={0.67} className="mr-1" />
              {t("admin.dealManagement.backToCategories")}
            </Button>
          ) : null}

          <h2 className="text-lg font-semibold text-pink-500">
            {selectedCategory?.nameFa || selectedCategory?.name || t("admin.dealManagement.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {selectedCategoryId
              ? t("admin.dealManagement.subtitleWithCount", { count: totalCount })
              : t("admin.dealManagement.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!selectedCategoryId && canManageDealOrdering && (
            <Button
              variant="outline"
              asChild
              className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
            >
              <Link to="/admin/deals/categories/ordering" className="flex items-center">
                <Icon path={mdiFormatListNumbered} size={0.67} className="mr-2" />
                {t("admin.dealCategoryOrdering.title", { defaultValue: "Deal Category Ordering" })}
              </Link>
            </Button>
          )}

          {selectedCategoryId && canManageDealOrdering && (
            <Button
              variant="outline"
              asChild
              className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
            >
              <Link
                to={`/admin/deals/categories/${selectedCategoryId}/ordering`}
                className="flex items-center"
              >
                <Icon path={mdiFormatListNumbered} size={0.67} className="mr-2" />
                {t("admin.categoryDealOrdering.cta", { defaultValue: "Order deals" })}
              </Link>
            </Button>
          )}

          {canCreateDeal && (
            <Button onClick={handleCreateNew} className="bg-pink-500 hover:bg-pink-600 text-white">
              <Icon path={mdiPlus} size={0.67} className="mr-2" />
              {t("admin.dealManagement.createDeal")}
            </Button>
          )}
        </div>
      </div>

      {!selectedCategoryId ? (
        <>
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Icon
                      path={mdiMagnify}
                      size={0.67}
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      placeholder={t("admin.dealManagement.searchCategoriesPlaceholder")}
                      value={categorySearchTerm}
                      onChange={(e) => setCategorySearchTerm(e.target.value)}
                      className="pl-10 bg-card border-border"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="show-empty-deal-categories"
                      checked={showEmptyCategories}
                      onCheckedChange={setShowEmptyCategories}
                    />
                    <label
                      htmlFor="show-empty-deal-categories"
                      className="text-sm text-muted-foreground cursor-pointer select-none"
                    >
                      {t("admin.dealManagement.showEmptyCategories")}
                    </label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {categoriesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-pink-500">
                <Icon path={mdiRefresh} size={0.83} className="animate-spin" />
                <span className="text-sm font-medium">{t("common.loading")}</span>
              </div>
            </div>
          ) : visibleDealCategories.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Icon path={mdiPackageVariant} size={2} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t("admin.dealManagement.noCategoriesFound")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-wrap justify-between p-3 gap-0" style={{ gap: 0 }}>
              {visibleDealCategories.map((category) => (
                <Card
                  key={category.id}
                  className="mb-4 rounded-2xl overflow-hidden border border-border bg-card hover:shadow-md transition-shadow cursor-pointer"
                  style={{ width: "48%" }}
                  onClick={() => handleCategorySelect(category.id)}
                >
                  {category.image ? (
                    <div className="w-full h-36 overflow-hidden bg-muted">
                      <img
                        src={getOptimizedImageUrl(category.image)}
                        alt={category.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-full h-36 bg-muted flex items-center justify-center">
                      <Icon path={mdiPackageVariant} size={1.33} className="text-muted-foreground" />
                    </div>
                  )}
                  <CardContent className="p-3">
                    <CardTitle className="text-base font-bold text-foreground mb-1.5 line-clamp-1">
                      {category.nameFa || category.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-4">
                      {category.descriptionFa || category.description || t("admin.menuCategories.noDescription")}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Icon path={mdiPackageVariant} size={0.5} className="text-pink-500" />
                        <span className="text-xs text-muted-foreground font-medium">
                          {t("admin.dealManagement.dealCount", {
                            count: category._count?.deals ?? 0,
                          })}
                        </span>
                      </div>
                      <Icon path={mdiChevronRight} size={0.67} className="text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Icon
                  path={mdiMagnify}
                  size={0.67}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  placeholder={t("admin.dealManagement.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10 bg-card border-border"
                />
              </div>
              <Select value={selectedActiveStatus} onValueChange={setSelectedActiveStatus}>
                <SelectTrigger className="w-[150px] bg-card border-border">
                  <SelectValue placeholder={t("common.status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  <SelectItem value="true">{t("common.active")}</SelectItem>
                  <SelectItem value="false">{t("common.inactive")}</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">{t("admin.dealManagement.sortBy")}:</span>
                <Button
                  size="sm"
                  onClick={() => handleSort("name")}
                  className={
                    sortBy === "name"
                      ? "bg-pink-500 hover:bg-pink-600 text-white"
                      : "bg-transparent text-foreground border border-border hover:bg-muted"
                  }
                >
                  <span className={sortBy === "name" ? "text-white" : ""}>
                    {t("admin.dealManagement.nameAZ")}
                  </span>
                  {sortBy === "name" && (
                    <Icon
                      path={mdiSort}
                      size={0.5}
                      className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`}
                    />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSort("createdAt")}
                  className={
                    sortBy === "createdAt"
                      ? "bg-pink-500 hover:bg-pink-600 text-white"
                      : "bg-transparent text-foreground border border-border hover:bg-muted"
                  }
                >
                  <span className={sortBy === "createdAt" ? "text-white" : ""}>
                    {sortBy === "createdAt"
                      ? sortOrder === "desc"
                        ? t("admin.dealManagement.newestFirst")
                        : t("admin.dealManagement.oldestFirst")
                      : t("admin.dealManagement.newestFirst")}
                  </span>
                  {sortBy === "createdAt" && (
                    <Icon
                      path={mdiSort}
                      size={0.5}
                      className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`}
                    />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deals List */}
      {deals.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Icon path={mdiPackageVariant} size={2} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("admin.dealManagement.noDealsFound")}</p>
            {canCreateDeal && (
              <Button
                onClick={handleCreateNew}
                className="mt-4 bg-pink-500 hover:bg-pink-600 text-white"
              >
                <Icon path={mdiPlus} size={0.67} className="mr-2" />
                {t("admin.dealManagement.createFirstDeal")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {deals.map((deal) => (
            <Card key={deal.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Icon path={mdiPackageVariant} size={0.67} className="text-pink-500" />
                    <span className="line-clamp-1">{deal.name}</span>
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        "px-2 py-1 text-xs rounded-full",
                        deal.isActive
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      )}
                    >
                      {deal.isActive ? t("common.active") : t("common.inactive")}
                    </span>
                    {deal.isFeatured && (
                      <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                        {t("admin.dealManagement.featured")}
                      </span>
                    )}
                    {(canUpdateDeal || canToggleDeal || canDeleteDeal) && (
                      <DropdownMenu
                        open={openDealMenuId === deal.id}
                        onOpenChange={(open) => setOpenDealMenuId(open ? deal.id : null)}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 touch-manipulation relative z-10 pointer-events-auto"
                            onPointerDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={() => {
                              setOpenDealMenuId((prev) => (prev === deal.id ? null : deal.id));
                            }}
                          >
                            <Icon path={mdiDotsVertical} size={0.67} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdateDeal && (
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenDealMenuId(null);
                                handleEdit(deal);
                              }}
                            >
                              <Icon path={mdiPencil} size={0.67} className="mr-2" />
                              {t("common.edit")}
                            </DropdownMenuItem>
                          )}
                          {canToggleDeal && (
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenDealMenuId(null);
                                handleToggleStatus(deal);
                              }}
                            >
                              <Icon
                                path={deal.isActive ? mdiEyeOff : mdiEye}
                                size={0.67}
                                className="mr-2"
                              />
                              {deal.isActive
                                ? t("admin.dealManagement.deactivate")
                                : t("admin.dealManagement.activate")}
                            </DropdownMenuItem>
                          )}
                          {canDeleteDeal && (
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenDealMenuId(null);
                                handleDeleteClick(deal);
                              }}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Icon path={mdiDelete} size={0.67} className="mr-2" />
                              {t("common.delete")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="space-y-2 mt-6">
                  {deal.image && (
                    <div className="w-full h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                      <img
                        src={
                          isExternalImage(deal.image)
                            ? deal.image
                            : getOptimizedImageUrl(deal.image)
                        }
                        alt={deal.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  )}

                  {deal.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{deal.description}</p>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">
                        {formatPrice(
                          deal.components?.reduce(
                            (sum, c) => {
                              const price = toNumber((c as any).price);
                              const q = toNumber((c as any).quantity);
                              const qty = Number.isFinite(q) && q > 0 ? q : 1;
                              return sum + price * qty;
                            },
                            0
                          ) || 0,
                          currency
                        )}
                      </span>
                      <span className="text-muted-foreground">{deal.category?.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {t("admin.dealManagement.componentsCount", {
                          count: deal.components?.length || 0,
                        })}
                      </span>
                      <span>
                        {(deal.excludedBranches?.length || 0) > 0
                          ? t("admin.dealManagement.excludedBranchesCount", {
                              count: deal.excludedBranches?.length || 0,
                            })
                          : t("admin.dealManagement.allBranches")}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {selectedCategoryId && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("admin.dealManagement.pagination", { currentPage, totalPages })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <Icon path={mdiChevronLeft} size={0.67} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <Icon path={mdiChevronRight} size={0.67} />
            </Button>
          </div>
        </div>
      )}

        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen || isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setIsEditDialogOpen(false);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl h-[90vh] overflow-hidden bg-card text-foreground border-border">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-semibold text-white">
              {selectedDeal
                ? t("admin.dealManagement.editDeal")
                : t("admin.dealManagement.createNewDeal")}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {selectedDeal
                ? t("admin.dealManagement.editDealDescription")
                : t("admin.dealManagement.createDealDescription")}
            </p>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
            <Tabs
              value={dealDialogTab}
              onValueChange={(v) => setDealDialogTab(v as any)}
              className="flex flex-col flex-1 min-h-0"
            >
              <TabsList className="w-full shrink-0">
                <TabsTrigger
                  value="basics"
                  className="flex-1 data-[state=active]:bg-pink-500 data-[state=active]:text-white data-[state=active]:shadow-none"
                >
                  {t("admin.dealManagement.tabs.basics")}
                </TabsTrigger>
                <TabsTrigger
                  value="components"
                  className="flex-1 data-[state=active]:bg-pink-500 data-[state=active]:text-white data-[state=active]:shadow-none"
                >
                  {t("admin.dealManagement.tabs.components")}
                </TabsTrigger>
                <TabsTrigger
                  value="availability"
                  className="flex-1 data-[state=active]:bg-pink-500 data-[state=active]:text-white data-[state=active]:shadow-none"
                >
                  {t("admin.dealManagement.tabs.availability")}
                </TabsTrigger>
                <TabsTrigger
                  value="addons"
                  className="flex-1 data-[state=active]:bg-pink-500 data-[state=active]:text-white data-[state=active]:shadow-none"
                >
                  {t("admin.dealManagement.tabs.addons")}
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                <TabsContent value="basics" className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">
                      {t("admin.dealManagement.fields.name")} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t("admin.dealManagement.fields.namePlaceholder")}
                      required
                      className="bg-card border-border"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      {t("admin.dealManagement.fields.category")} (English) <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.categoryId}
                      onValueChange={(value) => {
                        setFormData({ ...formData, categoryId: value });
                        const selectedCategory = categories.find(c => c.id === value);
                        if (selectedCategory) {
                          setFormData(prev => ({ ...prev, categoryId: value, categoryNameFa: selectedCategory.nameFa || "" }));
                        }
                      }}
                    >
                      <SelectTrigger className="bg-card border-border">
                        <SelectValue placeholder={t("admin.dealManagement.fields.categoryPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriesLoading ? (
                          <SelectItem value="" disabled>
                            {t("common.loading")}
                          </SelectItem>
                        ) : (
                          categories
                            .filter((c) => c.isActive)
                            .map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-medium">
                      {t("common.description")}
                    </Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder={t("admin.dealManagement.fields.descriptionPlaceholder")}
                      rows={3}
                      className="bg-transparent text-foreground border-border resize-none"
                    />
                  </div>

                  {/* Persian Fields Section */}
                  <div className="border-t border-border pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">{t("admin.dealManagement.persianSectionTitle")}</h3>
                    <div className="space-y-2">
                      <Label htmlFor="nameFa" className="text-sm font-medium">
                        {t("admin.dealManagement.nameFa")}
                      </Label>
                      <Input
                        id="nameFa"
                        value={formData.nameFa || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, nameFa: e.target.value })
                        }
                        placeholder={t("admin.dealManagement.nameFaPlaceholder")}
                        className="bg-card border-border"
                        dir="rtl"
                      />
                    </div>
                    <div className="space-y-2 mt-4">
                      <Label className="text-sm font-medium">
                        {t("admin.dealManagement.fields.category")} (فارسی) <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={formData.categoryId}
                        onValueChange={(value) => {
                          setFormData({ ...formData, categoryId: value });
                          const selectedCategory = categories.find(c => c.id === value);
                          if (selectedCategory) {
                            setFormData(prev => ({ ...prev, categoryId: value, categoryNameFa: selectedCategory.nameFa || "" }));
                          }
                        }}
                      >
                        <SelectTrigger className="bg-card border-border">
                          <SelectValue placeholder={t("admin.dealManagement.fields.categoryPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {categoriesLoading ? (
                            <SelectItem value="" disabled>
                              {t("common.loading")}
                            </SelectItem>
                          ) : (
                            categories
                              .filter((c) => c.isActive && c.nameFa)
                              .map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  {category.nameFa}
                                </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <ImageUpload
                      value={formData.image}
                      onChange={(value) => setFormData({ ...formData, image: value })}
                      label={t("admin.dealManagement.fields.image")}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    {canToggleDeal && (
                      <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border flex-1">
                        <input
                          type="checkbox"
                          id="isActive"
                          checked={formData.isActive}
                          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                          className="h-4 w-4 rounded border-border text-pink-500 focus:ring-pink-500"
                        />
                        <Label htmlFor="isActive" className="text-sm font-medium cursor-pointer">
                          {t("common.active")}
                        </Label>
                      </div>
                    )}
                    <div className="flex items-center justify-between space-y-0 rounded-md border border-border p-3 flex-1">
                      <Label htmlFor="isFeatured" className="text-sm font-medium">
                        {t("admin.dealManagement.featured")}
                      </Label>
                      <Switch
                        id="isFeatured"
                        checked={formData.isFeatured || false}
                        onCheckedChange={(checked) => setFormData({ ...formData, isFeatured: checked })}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="components" className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        {t("admin.dealManagement.fields.components")} <span className="text-red-500">*</span>
                      </Label>
                      <Button type="button" variant="outline" size="sm" onClick={addComponent}>
                        <Icon path={mdiPlus} size={0.67} className="mr-1" />
                        {t("admin.dealManagement.addComponent")}
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {formData.components.map((component, index) => (
                        <div key={index} className="p-3 border border-border rounded-lg space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">
                              {t("admin.dealManagement.componentNumber", { index: index + 1 })}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeComponent(index)}
                            >
                              <Icon path={mdiClose} size={0.67} />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div className="sm:col-span-1">
                              <Label className="text-xs">{t("common.name")}</Label>
                              <Input
                                value={component.name}
                                onChange={(e) => updateComponent(index, "name", e.target.value)}
                                placeholder="e.g., Main Course"
                                className="bg-card border-border"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">{t("mealCustomization.quantity")}</Label>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                value={(component as any).quantity ?? 1}
                                onChange={(e) => {
                                  const next = Math.max(0, parseInt(e.target.value || "0", 10) || 0);
                                  updateComponent(index, "quantity" as any, next);
                                }}
                                className="bg-card border-border"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">{t("admin.dealManagement.fields.price")}</Label>
                              <PriceInput
                                value={componentPriceInputs[index] || ""}
                                onChange={(value: string) => {
                                  setComponentPriceInputs({
                                    ...componentPriceInputs,
                                    [index]: value,
                                  });
                                  updateComponent(
                                    index,
                                    "price",
                                    value === "" ? 0 : parseFloat(value) || 0
                                  );
                                }}
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">{t("admin.dealManagement.fields.taxPercent")}</Label>
                              <PriceInput
                                value={componentTaxInputs[index] || ""}
                                onChange={(value: string) => {
                                  setComponentTaxInputs({
                                    ...componentTaxInputs,
                                    [index]: value,
                                  });
                                  updateComponent(
                                    index,
                                    "taxPercentage",
                                    value === "" ? 0 : parseFloat(value) || 0
                                  );
                                }}
                                placeholder="0"
                                showDollarIcon={false}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {formData.components.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          {t("admin.dealManagement.noComponents")}
                        </p>
                      )}
                    </div>
                    {formData.components.length > 0 && (
                      <div className="text-right text-sm font-medium text-pink-500">
                        {t("admin.dealManagement.total")}: {formatPrice(getDealTotalPrice(), currency)}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="availability" className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-foreground font-medium">{t("admin.dealManagement.excludedBranches")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("admin.dealManagement.excludedBranchesHint")}
                    </p>
                    <div className="max-h-64 overflow-y-auto border border-border rounded-lg p-2 space-y-2">
                      {branches.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">{t("admin.dealManagement.noBranches")}</p>
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
                              <span className="text-sm text-foreground">{branch.name}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="addons" className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t("admin.dealManagement.addonsOptional")}</Label>
                    <div className="max-h-64 overflow-y-auto border rounded-md p-3 bg-card">
                      {addons.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t("admin.dealManagement.noAddons")}</p>
                      ) : (
                        <div className="space-y-2">
                          {addons
                            .filter((a) => a.isActive)
                            .map((addon) => (
                              <div key={addon.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`addon-${addon.id}`}
                                  checked={formData.addOnIds?.includes(addon.id) || false}
                                  onCheckedChange={(checked) => {
                                    const currentIds = formData.addOnIds || [];
                                    if (checked) {
                                      setFormData({
                                        ...formData,
                                        addOnIds: [...currentIds, addon.id],
                                      });
                                    } else {
                                      setFormData({
                                        ...formData,
                                        addOnIds: currentIds.filter((id) => id !== addon.id),
                                      });
                                    }
                                  }}
                                  variant="pink"
                                />
                                <Label htmlFor={`addon-${addon.id}`} className="text-sm cursor-pointer">
                                  {addon.name}
                                </Label>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-between bg-transparent text-foreground border border-border hover:bg-muted"
                      onClick={() => setIsDeclarationsDialogOpen(true)}
                    >
                      <span>{t("admin.dealManagement.declarations")}</span>
                      <span className="text-muted-foreground text-xs">
                        {t("admin.dealManagement.selectedCount", { count: (formData.declarationIds || []).length })}
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-between bg-transparent text-foreground border border-border hover:bg-muted"
                      onClick={() => setIsOptionalIngredientsDialogOpen(true)}
                    >
                      <span>{t("admin.dealManagement.optionalIngredients")}</span>
                      <span className="text-muted-foreground text-xs">
                        {t("admin.dealManagement.selectedCount", {
                          count: (formData.optionalIngredientIds || []).length,
                        })}
                      </span>
                    </Button>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-border bg-card">
              <Button
                type="button"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setIsEditDialogOpen(false);
                  resetForm();
                }}
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
                  ? t("common.saving")
                  : selectedDeal
                  ? t("admin.dealManagement.updateDeal")
                  : t("admin.dealManagement.createDeal")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-sm bg-card text-foreground border-border">
          <DialogHeader>
            <DialogTitle>{t("admin.dealManagement.deleteDealTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("admin.dealManagement.deleteDealConfirm", { name: dealToDelete?.name || "" })}
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="border-border"
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white">
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeclarationsDialogOpen} onOpenChange={setIsDeclarationsDialogOpen}>
        <DialogContent className="max-w-lg bg-card text-foreground border-border">
          <DialogHeader>
            <DialogTitle>{t("admin.dealManagement.dealDeclarationsTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Icon
                path={mdiMagnify}
                size={0.67}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder={t("admin.dealManagement.searchDeclarations")}
                value={declarationSearchTerm}
                onChange={(e) => setDeclarationSearchTerm(e.target.value)}
                className="pl-10 bg-card border-border"
              />
            </div>
            <div className="max-h-80 overflow-y-auto border border-border rounded-md p-3">
              {filteredDeclarations.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("admin.dealManagement.noDeclarations")}</p>
              ) : (
                <div className="space-y-2">
                  {filteredDeclarations.map((decl) => (
                    <div key={decl.id} className="flex items-start space-x-2">
                      <Checkbox
                        id={`deal-decl-${decl.id}`}
                        checked={formData.declarationIds?.includes(decl.id) || false}
                        onCheckedChange={() => toggleDeclaration(decl.id)}
                        variant="pink"
                      />
                      <Label
                        htmlFor={`deal-decl-${decl.id}`}
                        className="text-sm cursor-pointer leading-5"
                      >
                        <div className="font-medium">
                          {decl.icon ? `${decl.icon} ` : ""}
                          {decl.name}
                        </div>
                        {(decl.description || decl.type) && (
                          <div className="text-xs text-muted-foreground">
                            {decl.type ? `${decl.type} • ` : ""}
                            {decl.description || ""}
                          </div>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDeclarationsDialogOpen(false)}>
                {t("admin.dealManagement.done")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isOptionalIngredientsDialogOpen}
        onOpenChange={setIsOptionalIngredientsDialogOpen}
      >
        <DialogContent className="max-w-lg bg-card text-foreground border-border">
          <DialogHeader>
            <DialogTitle>{t("admin.dealManagement.dealOptionalIngredientsTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Icon
                path={mdiMagnify}
                size={0.67}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder={t("admin.dealManagement.searchOptionalIngredients")}
                value={optionalIngredientSearchTerm}
                onChange={(e) => setOptionalIngredientSearchTerm(e.target.value)}
                className="pl-10 bg-card border-border"
              />
            </div>
            <div className="max-h-80 overflow-y-auto border border-border rounded-md p-3">
              {filteredOptionalIngredients.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("admin.dealManagement.noOptionalIngredients")}</p>
              ) : (
                <div className="space-y-2">
                  {filteredOptionalIngredients.map((ing) => (
                    <div key={ing.id} className="flex items-start space-x-2">
                      <Checkbox
                        id={`deal-opt-${ing.id}`}
                        checked={formData.optionalIngredientIds?.includes(ing.id) || false}
                        onCheckedChange={() => toggleOptionalIngredient(ing.id)}
                        variant="pink"
                      />
                      <Label
                        htmlFor={`deal-opt-${ing.id}`}
                        className="text-sm cursor-pointer leading-5"
                      >
                        <div className="font-medium">{ing.name}</div>
                        {ing.description && (
                          <div className="text-xs text-muted-foreground">{ing.description}</div>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsOptionalIngredientsDialogOpen(false)}
              >
                {t("admin.dealManagement.done")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DealManagement;
