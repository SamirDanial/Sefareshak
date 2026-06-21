import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  EyeOff,
  MoreVertical,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { dealService, type Deal, type DealComponent, type DealFormData } from "../services/dealService";
import { categoryService, type Category } from "../services/categoryService";
import branchService, { type Branch } from "../services/branchService";
import { addonService, type Addon } from "../services/addonService";
import { declarationService, type Declaration } from "../services/declarationService";
import { optionalIngredientService, type OptionalIngredient } from "../services/optionalIngredientService";
import ImageUpload from "../components/ImageUpload";
import OrganizationSearchSelect from "../components/OrganizationSearchSelect";
import { formatPrice } from "../utils/currency";
import { SettingsService } from "../services/settingsService";
import PageHeader from "../components/PageHeader";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const isExternalImage = (url: string): boolean => {
  return url.startsWith("http://") || url.startsWith("https://");
};

const getOptimizedImageUrl = (imagePath: string | null): string => {
  if (!imagePath) return "";

  if (isExternalImage(imagePath)) return imagePath;

  if (imagePath.startsWith("/uploads/images/")) {
    const filename = imagePath.replace("/uploads/images/", "");
    return `${API_BASE_URL}/uploads/images/${filename}`;
  }

  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

const toNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const DealManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const canCreateDeal = canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.CREATE }]);
  const canUpdateDeal = canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.UPDATE }]);
  const canDeleteDeal = canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.DELETE }]);
  const canToggleDeal = canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.TOGGLE_ACTIVE }]);
  const canDealCategoryOrdering = canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.ORDERING }]);
  const canReorderCategoryDeals = canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.REORDER_CATEGORY }]);
  const canReorderFeaturedDeals = canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.REORDER_FEATURED }]);

  const canManageDealOrdering =
    canDealCategoryOrdering && canReorderCategoryDeals && canReorderFeaturedDeals;

  const [currency, setCurrency] = useState("USD");

  // Category selection state (mirrors React frontend flow)
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categorySearchTerm, setCategorySearchTerm] = useState("");
  const [showEmptyCategories, setShowEmptyCategories] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

  // Deals list state
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedActiveStatus, setSelectedActiveStatus] = useState<string>("all");
  const [orgVersion, setOrgVersion] = useState(0);

  // Reference data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [optionalIngredients, setOptionalIngredients] = useState<OptionalIngredient[]>([]);

  // Dropdown menu state
  const [openDealMenuId, setOpenDealMenuId] = useState<string | null>(null);
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [dealToDelete, setDealToDelete] = useState<Deal | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [dealDialogTab, setDealDialogTab] = useState<"basics" | "components" | "availability" | "addons">(
    "basics"
  );

  // Form state
  const [formData, setFormData] = useState<DealFormData>({
    name: "",
    description: "",
    image: "",
    categoryId: "",
    excludedBranches: [],
    isActive: true,
    isFeatured: false,
    components: [],
    addOnIds: [],
    declarationIds: [],
    optionalIngredientIds: [],
  });

  const [componentPriceInputs, setComponentPriceInputs] = useState<Record<number, string>>({});
  const [componentTaxInputs, setComponentTaxInputs] = useState<Record<number, string>>({});
  const [componentQtyInputs, setComponentQtyInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    const loadCurrency = async () => {
      try {
        const token = await getToken();
        const settingsResponse = await SettingsService.getSettings(token || undefined);
        const maybeCurrency = (settingsResponse as any)?.data?.currency;
        if (typeof maybeCurrency === "string" && maybeCurrency.trim()) {
          setCurrency(maybeCurrency.trim());
        }
      } catch {
        // ignore
      }
    };

    loadCurrency();
  }, [getToken]);

  useEffect(() => {
    if (openDealMenuId) {
      const button = buttonRefs.current[openDealMenuId];
      const dropdown = dropdownRefs.current[openDealMenuId];
      if (button && dropdown) {
        const rect = button.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
      }
    }
  }, [openDealMenuId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!openDealMenuId) return;
      const target = event.target as HTMLElement;
      if (!target.closest(`[data-dropdown-menu]`) && !target.closest(`[data-dropdown-trigger]`)) {
        setOpenDealMenuId(null);
      }
    };

    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openDealMenuId]);

  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true);
      const token = await getToken();
      const response = await categoryService.getCategories(1, 1000, "", "listOrder", "asc", token || undefined);
      setCategories(Array.isArray(response.categories) ? response.categories : []);
    } catch (error) {
      console.error("Error fetching deal categories:", error);
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const fetchReferenceData = async () => {
    try {
      const token = await getToken();
      const [branchesData, addonsData, declData, optData] = await Promise.all([
        branchService.getBranches(token || undefined),
        addonService.getAddons(1, 1000, "", "name", "asc", token || undefined),
        declarationService.getAllDeclarations(undefined, token || undefined),
        optionalIngredientService.getAllOptionalIngredients(token || undefined),
      ]);

      setBranches(Array.isArray(branchesData) ? branchesData : []);
      setAddons(addonsData?.addons || []);
      setDeclarations(Array.isArray(declData) ? declData : []);
      setOptionalIngredients(Array.isArray(optData) ? optData : []);
    } catch (error) {
      console.error("Error fetching deal reference data:", error);
    }
  };

  const fetchDeals = async () => {
    if (!selectedCategoryId) return;
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

      setDeals(response.deals || []);
      setTotalPages(response.pagination?.totalPages || 1);
      setTotalCount(response.pagination?.totalCount || 0);
    } catch (error) {
      console.error("Error fetching deals:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchReferenceData();
  }, [orgVersion]);

  useEffect(() => {
    const urlCategoryId = searchParams.get("categoryId") || "";
    if (urlCategoryId !== selectedCategoryId) {
      setSelectedCategoryId(urlCategoryId);
      setSearchTerm("");
      setCurrentPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    fetchDeals();
  }, [selectedCategoryId, currentPage, searchTerm, sortBy, sortOrder, selectedActiveStatus, orgVersion]);

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

      // Reset state; then refetch all data under new org header
      setSearchTerm("");
      setSelectedActiveStatus("all");
      setSortBy("createdAt");
      setSortOrder("desc");
      setCurrentPage(1);
      setDeals([]);
      setTotalPages(1);
      setTotalCount(0);

      setSelectedCategoryId("");
      setCategorySearchTerm("");
      setShowEmptyCategories(false);

      setBranches([]);
      setAddons([]);
      setDeclarations([]);
      setOptionalIngredients([]);
      setCategories([]);

      setOpenDealMenuId(null);
      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      setIsDeleteDialogOpen(false);
      setDealToDelete(null);
      setSelectedDeal(null);
      setIsSubmitting(false);
      setDealDialogTab("basics");

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

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      image: "",
      categoryId: selectedCategoryId || "",
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
    setComponentQtyInputs({});
    setSelectedDeal(null);
    setDealDialogTab("basics");
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setSearchParams(categoryId ? { categoryId } : {});
    setSearchTerm("");
    setSelectedActiveStatus("all");
    setSortBy("createdAt");
    setSortOrder("desc");
    setCurrentPage(1);
    setDeals([]);
    setTotalCount(0);
    setTotalPages(1);
  };

  const handleCreateNew = () => {
    resetForm();
    setFormData((prev) => ({ ...prev, categoryId: selectedCategoryId || "" }));
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (deal: Deal) => {
    setSelectedDeal(deal);
    const priceInputs: Record<number, string> = {};
    const taxInputs: Record<number, string> = {};
    const qtyInputs: Record<number, string> = {};

    (deal.components || []).forEach((c, i) => {
      priceInputs[i] = String((c as any).price ?? 0);
      taxInputs[i] = String((c as any).taxPercentage ?? 0);
      qtyInputs[i] = String((c as any).quantity ?? 1);
    });

    setComponentPriceInputs(priceInputs);
    setComponentTaxInputs(taxInputs);
    setComponentQtyInputs(qtyInputs);

    setFormData({
      name: deal.name,
      description: deal.description || "",
      image: deal.image || "",
      categoryId: deal.categoryId,
      excludedBranches: deal.excludedBranches || [],
      isActive: deal.isActive,
      isFeatured: deal.isFeatured || false,
      components: (deal.components || []).map((c) => ({
        id: c.id,
        name: c.name,
        quantity: (c as any).quantity ?? 1,
        price: toNumber((c as any).price),
        taxPercentage: toNumber((c as any).taxPercentage),
        sortOrder: c.sortOrder,
      })),
      addOnIds: (deal.dealAddOns || []).map((a: any) => a?.addOn?.id).filter(Boolean),
      declarationIds: (deal.dealDeclarations || []).map((d: any) => d?.declaration?.id).filter(Boolean),
      optionalIngredientIds: (deal.dealOptionalIngredients || [])
        .map((o: any) => o?.optionalIngredient?.id)
        .filter(Boolean),
    });

    setDealDialogTab("basics");
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (deal: Deal) => {
    setDealToDelete(deal);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!dealToDelete) return;
    try {
      const token = await getToken();
      await dealService.deleteDeal(dealToDelete.id, token || undefined);
      setIsDeleteDialogOpen(false);
      setDealToDelete(null);
      await fetchDeals();
    } catch (error) {
      console.error("Error deleting deal:", error);
      alert(t("admin.dealManagement.deleteFailed"));
    }
  };

  const handleToggleStatus = async (deal: Deal) => {
    try {
      const token = await getToken();
      await dealService.toggleDealStatus(deal.id, token || undefined);
      await fetchDeals();
    } catch (error) {
      console.error("Error toggling deal status:", error);
      alert(t("admin.dealManagement.toggleFailed"));
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

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
    setComponentQtyInputs({ ...componentQtyInputs, [newIndex]: "1" });
  };

  const removeComponent = (index: number) => {
    const newComponents = formData.components.filter((_, i) => i !== index);
    setFormData({ ...formData, components: newComponents });

    const newPriceInputs: Record<number, string> = {};
    const newTaxInputs: Record<number, string> = {};
    const newQtyInputs: Record<number, string> = {};

    newComponents.forEach((c, i) => {
      newPriceInputs[i] = String((c as any).price ?? 0);
      newTaxInputs[i] = String((c as any).taxPercentage ?? 0);
      newQtyInputs[i] = String((c as any).quantity ?? 1);
    });

    setComponentPriceInputs(newPriceInputs);
    setComponentTaxInputs(newTaxInputs);
    setComponentQtyInputs(newQtyInputs);
  };

  const updateComponent = (index: number, field: keyof DealComponent, value: any) => {
    const newComponents = [...formData.components];
    newComponents[index] = { ...newComponents[index], [field]: value };
    setFormData({ ...formData, components: newComponents });
  };

  const toggleExcludedBranch = (branchId: string) => {
    const current = formData.excludedBranches || [];
    const next = current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId];
    setFormData({ ...formData, excludedBranches: next });
  };

  const toggleStringId = (list: string[] | undefined, id: string): string[] => {
    const current = list || [];
    return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  };

  const getDealTotalPrice = () => {
    return (formData.components || []).reduce((sum, c: any) => {
      const price = toNumber(c?.price);
      const q = toNumber(c?.quantity);
      const qty = Number.isFinite(q) && q > 0 ? q : 1;
      return sum + price * qty;
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.categoryId) {
      alert(t("admin.dealManagement.validation.nameAndCategoryRequired"));
      return;
    }

    if (!Array.isArray(formData.components) || formData.components.length === 0) {
      alert(t("admin.dealManagement.validation.atLeastOneComponentRequired"));
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
    } catch (error: any) {
      console.error("Error saving deal:", error);
      const errorMessage = error?.message || t("admin.dealManagement.saveFailed");
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredAddons = useMemo(() => addons.filter((a) => (a as any).isActive !== false), [addons]);

  const filteredDeclarations = useMemo(() => declarations, [declarations]);
  const filteredOptionalIngredients = useMemo(() => optionalIngredients, [optionalIngredients]);

  const Dialog = ({ open, onClose, title, children }: any) => {
    if (!open) return null;
    return (
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
        onClick={onClose}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
            <h3 style={{ fontSize: "20px", fontWeight: 800, color: "#111827", margin: 0 }}>{title}</h3>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "4px",
                border: "none",
                backgroundColor: "transparent",
                cursor: "pointer",
                borderRadius: "4px",
              }}
            >
              <XCircle style={{ height: "20px", width: "20px", color: "#6b7280" }} />
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: "24px", height: "100%", overflow: "auto" }}>
      <div style={{ marginBottom: "18px" }}>
        <PageHeader
          title={selectedCategory?.name || t("admin.dealManagement.title")}
          description={
            !selectedCategoryId ? (
              <div>
                {t("admin.dealManagement.subtitleWithCount", { count: totalCount })}
              </div>
            ) : (
              t("admin.dealManagement.subtitle")
            )
          }
          actions={
            <>
              {!selectedCategoryId && canManageDealOrdering && (
                <button
                  type="button"
                  onClick={() => navigate("/admin/deals/categories/ordering")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #fbcfe8",
                    backgroundColor: "#ffffff",
                    color: "#db2777",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {t("admin.dealCategoryOrdering.title")}
                </button>
              )}

              {selectedCategoryId && canManageDealOrdering && (
                <button
                  type="button"
                  onClick={() => navigate(`/admin/deals/categories/${selectedCategoryId}/ordering`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #fbcfe8",
                    backgroundColor: "#ffffff",
                    color: "#db2777",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {t("admin.categoryDealOrdering.cta")}
                </button>
              )}

              {selectedCategoryId && canCreateDeal && (
                <button
                  type="button"
                  onClick={handleCreateNew}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #ec4899",
                    backgroundColor: "#ec4899",
                    color: "#ffffff",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#db2777";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#ec4899";
                  }}
                >
                  <Plus style={{ width: 16, height: 16 }} />
                  {t("admin.dealManagement.createDeal", { defaultValue: "Create deal" })}
                </button>
              )}
            </>
          }
        />

        {selectedCategoryId ? (
          <button
            type="button"
            onClick={() => {
              handleCategorySelect("");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: 0,
              border: "none",
              backgroundColor: "transparent",
              color: "#6b7280",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <ChevronLeft style={{ width: 16, height: 16 }} />
            {t("admin.dealManagement.backToCategories")}
          </button>
        ) : null}
      </div>

      {!selectedCategoryId ? (
        <div>
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "18px",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <Search
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    height: "18px",
                    width: "18px",
                    color: "#9ca3af",
                  }}
                />
                <input
                  type="text"
                  placeholder={t("admin.dealManagement.searchCategoriesPlaceholder")}
                  value={categorySearchTerm}
                  onChange={(e) => setCategorySearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 40px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "10px",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#6b7280", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showEmptyCategories}
                  onChange={(e) => setShowEmptyCategories(e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
                {t("admin.dealManagement.showEmptyCategories")}
              </label>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", backgroundColor: "#f3f4f6", borderRadius: "999px", fontSize: "12px", color: "#374151", fontWeight: 700 }}>
                <Package style={{ width: "14px", height: "14px", color: "#6b7280" }} />
                {t("admin.dealManagement.totalCategories", { count: visibleDealCategories.length })}
              </div>
            </div>
          </div>

          {categoriesLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#ec4899", fontWeight: 800 }}>
                <RefreshCw style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
                {t("common.loading")}
              </div>
            </div>
          ) : visibleDealCategories.length === 0 ? (
            <div style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "32px", textAlign: "center" }}>
              <Package style={{ width: 48, height: 48, color: "#9ca3af", margin: "0 auto 12px" }} />
              <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>{t("admin.dealManagement.noCategoriesFound")}</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between" }}>
              {visibleDealCategories.map((category) => {
                const imageUrl = getOptimizedImageUrl(category.image);
                const dealsCount = category._count?.deals ?? 0;
                return (
                  <div
                    key={category.id}
                    style={{
                      width: "48%",
                      marginBottom: "16px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "16px",
                      overflow: "hidden",
                      cursor: "pointer",
                      backgroundColor: "#ffffff",
                    }}
                    onClick={() => handleCategorySelect(category.id)}
                  >
                    {imageUrl ? (
                      <div style={{ width: "100%", height: "144px", overflow: "hidden", backgroundColor: "#f3f4f6" }}>
                        <img
                          src={imageUrl}
                          alt={category.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                    ) : (
                      <div style={{ width: "100%", height: "144px", backgroundColor: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Package style={{ width: 28, height: 28, color: "#9ca3af" }} />
                      </div>
                    )}

                    <div style={{ padding: "12px" }}>
                      <div style={{ fontSize: "16px", fontWeight: 900, color: "#111827", marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {category.name}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6b7280", minHeight: "32px", lineHeight: "16px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginBottom: "12px" }}>
                        {category.description || t("admin.menuCategories.noDescription")}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>
                          {t("admin.dealManagement.dealCount", { count: dealsCount })}
                        </span>
                        <ChevronRight style={{ width: 18, height: 18, color: "#9ca3af" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "18px",
            }}
          >
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: 1, position: "relative", minWidth: 260 }}>
                <Search
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    height: "18px",
                    width: "18px",
                    color: "#9ca3af",
                  }}
                />
                <input
                  type="text"
                  placeholder={t("admin.dealManagement.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 40px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "10px",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
              </div>

              <OrganizationSearchSelect
                organizations={[
                  { id: "all", name: t("common.all") },
                  { id: "true", name: t("common.active") },
                  { id: "false", name: t("common.inactive") },
                ]}
                value={selectedActiveStatus}
                onValueChange={(value) => {
                  setSelectedActiveStatus(value);
                  setCurrentPage(1);
                }}
                placeholder={t("common.status")}
                searchPlaceholder={t("common.search")}
                noResultsText={t("common.noResults")}
              />

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => handleSort("name")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    backgroundColor: sortBy === "name" ? "#ec4899" : "#ffffff",
                    color: sortBy === "name" ? "#ffffff" : "#111827",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  {t("admin.dealManagement.nameAZ")}
                </button>
                <button
                  type="button"
                  onClick={() => handleSort("createdAt")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    backgroundColor: sortBy === "createdAt" ? "#ec4899" : "#ffffff",
                    color: sortBy === "createdAt" ? "#ffffff" : "#111827",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  {sortBy === "createdAt" && sortOrder === "asc"
                    ? t("admin.dealManagement.oldestFirst")
                    : t("admin.dealManagement.newestFirst")}
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#ec4899", fontWeight: 800 }}>
                <RefreshCw style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
                {t("common.loading")}
              </div>
            </div>
          ) : deals.length === 0 ? (
            <div style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "32px", textAlign: "center" }}>
              <Package style={{ width: 48, height: 48, color: "#9ca3af", margin: "0 auto 12px" }} />
              <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>{t("admin.dealManagement.noDealsFound")}</p>
              {canCreateDeal && (
                <button
                  type="button"
                  onClick={handleCreateNew}
                  style={{
                    marginTop: "16px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #ec4899",
                    backgroundColor: "#ec4899",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 900,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Plus style={{ width: 16, height: 16 }} />
                  {t("admin.dealManagement.createFirstDeal")}
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
              {deals.map((deal) => {
                const total = (deal.components || []).reduce((sum, c: any) => {
                  const price = toNumber(c?.price);
                  const q = toNumber(c?.quantity);
                  const qty = Number.isFinite(q) && q > 0 ? q : 1;
                  return sum + price * qty;
                }, 0);

                const imageSrc = deal.image ? getOptimizedImageUrl(deal.image) : "";

                return (
                  <div
                    key={deal.id}
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "16px",
                      overflow: "hidden",
                    }}
                  >
                    {imageSrc ? (
                      <div style={{ width: "100%", height: 120, overflow: "hidden", backgroundColor: "#f3f4f6" }}>
                        <img
                          src={imageSrc}
                          alt={deal.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                    ) : null}

                    <div style={{ padding: "12px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "14px", fontWeight: 900, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {deal.name}
                          </div>
                          {deal.description ? (
                            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                              {deal.description}
                            </div>
                          ) : null}
                        </div>

                        <div style={{ position: "relative" }}>
                          {(canUpdateDeal || canToggleDeal || canDeleteDeal) && (
                            <button
                              type="button"
                              ref={(el) => {
                                buttonRefs.current[deal.id] = el;
                              }}
                              data-dropdown-trigger
                              onClick={() => setOpenDealMenuId((prev) => (prev === deal.id ? null : deal.id))}
                              style={{
                                border: "1px solid #e5e7eb",
                                borderRadius: "10px",
                                backgroundColor: "#ffffff",
                                padding: "8px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <MoreVertical style={{ width: 16, height: 16, color: "#6b7280" }} />
                            </button>
                          )}

                          {openDealMenuId === deal.id && (
                            <div
                              ref={(el) => {
                                dropdownRefs.current[deal.id] = el;
                              }}
                              data-dropdown-menu
                              style={{
                                position: "fixed",
                                backgroundColor: "#ffffff",
                                border: "1px solid #e5e7eb",
                                borderRadius: "12px",
                                boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                                zIndex: 60,
                                width: "200px",
                                overflow: "hidden",
                              }}
                            >
                              {canUpdateDeal && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenDealMenuId(null);
                                    handleEdit(deal);
                                  }}
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    padding: "10px 12px",
                                    border: "none",
                                    backgroundColor: "transparent",
                                    cursor: "pointer",
                                    textAlign: "left",
                                  }}
                                >
                                  <Edit style={{ width: 16, height: 16 }} />
                                  {t("common.edit")}
                                </button>
                              )}

                              {canToggleDeal && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenDealMenuId(null);
                                    handleToggleStatus(deal);
                                  }}
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    padding: "10px 12px",
                                    border: "none",
                                    backgroundColor: "transparent",
                                    cursor: "pointer",
                                    textAlign: "left",
                                  }}
                                >
                                  {deal.isActive ? (
                                    <EyeOff style={{ width: 16, height: 16 }} />
                                  ) : (
                                    <Eye style={{ width: 16, height: 16 }} />
                                  )}
                                  {deal.isActive ? t("admin.dealManagement.deactivate") : t("admin.dealManagement.activate")}
                                </button>
                              )}

                              {canDeleteDeal && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenDealMenuId(null);
                                    handleDeleteClick(deal);
                                  }}
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    padding: "10px 12px",
                                    border: "none",
                                    backgroundColor: "transparent",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    color: "#dc2626",
                                  }}
                                >
                                  <Trash2 style={{ width: 16, height: 16 }} />
                                  {t("common.delete")}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 900, color: "#111827" }}>
                          {formatPrice(total, currency)}
                        </span>
                        <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>
                          {deal.category?.name || selectedCategory?.name || ""}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
                        <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>
                          {t("admin.dealManagement.componentsCount", { count: deal.components?.length || 0 })}
                        </span>
                        <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>
                          {(deal.excludedBranches?.length || 0) > 0
                            ? t("admin.dealManagement.excludedBranchesCount", { count: deal.excludedBranches?.length || 0 })
                            : t("admin.dealManagement.allBranches")}
                        </span>
                      </div>

                      <div style={{ marginTop: "10px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "4px 10px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 900,
                            backgroundColor: deal.isActive ? "#dcfce7" : "#fee2e2",
                            color: deal.isActive ? "#166534" : "#991b1b",
                          }}
                        >
                          {deal.isActive ? t("common.active") : t("common.inactive")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "18px" }}>
              <p style={{ fontSize: "13px", color: "#6b7280", fontWeight: 700, margin: 0 }}>
                {t("admin.dealManagement.pagination", { currentPage, totalPages })}
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: "8px",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "#ffffff",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    opacity: currentPage === 1 ? 0.5 : 1,
                  }}
                >
                  <ChevronLeft style={{ width: 16, height: 16 }} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: "8px",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "#ffffff",
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                    opacity: currentPage === totalPages ? 0.5 : 1,
                  }}
                >
                  <ChevronRight style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog
        open={isCreateDialogOpen || isEditDialogOpen}
        onClose={() => {
          setIsCreateDialogOpen(false);
          setIsEditDialogOpen(false);
          resetForm();
        }}
        title={selectedDeal ? t("admin.dealManagement.editDeal") : t("admin.dealManagement.createNewDeal")}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {([
              { id: "basics", label: t("admin.dealManagement.tabs.basics") },
              { id: "components", label: t("admin.dealManagement.tabs.components") },
              { id: "availability", label: t("admin.dealManagement.tabs.availability") },
              { id: "addons", label: t("admin.dealManagement.tabs.addons") },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDealDialogTab(tab.id)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: dealDialogTab === tab.id ? "#ec4899" : "#ffffff",
                  color: dealDialogTab === tab.id ? "#ffffff" : "#111827",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {dealDialogTab === "basics" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 900, color: "#111827", marginBottom: "6px" }}>
                  {t("admin.dealManagement.fields.name")} *
                </label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("admin.dealManagement.fields.namePlaceholder")}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", outline: "none" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 900, color: "#111827", marginBottom: "6px" }}>
                  {t("common.description")}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t("admin.dealManagement.fields.descriptionPlaceholder")}
                  rows={3}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", outline: "none", resize: "vertical" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 900, color: "#111827", marginBottom: "6px" }}>
                  {t("admin.dealManagement.fields.category")} *
                </label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", outline: "none" }}
                >
                  <option value="">{t("admin.dealManagement.fields.categoryPlaceholder")}</option>
                  {categories.filter((c) => c.isActive).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <ImageUpload
                  key={`deal-image-${selectedDeal?.id || "new"}-${formData.image || "no-image"}`}
                  value={formData.image || ""}
                  onChange={(value) => setFormData({ ...formData, image: value || "" })}
                  showPlaceholder={Boolean(selectedDeal) && !formData.image}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {canToggleDeal && (
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#111827", fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={formData.isActive || false}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    {t("common.active")}
                  </label>
                )}

                <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#111827", fontWeight: 800 }}>
                  <input
                    type="checkbox"
                    checked={formData.isFeatured || false}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                  />
                  {t("admin.dealManagement.featured")}
                </label>
              </div>
            </div>
          )}

          {dealDialogTab === "components" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: "13px", fontWeight: 900, color: "#111827" }}>
                  {t("admin.dealManagement.fields.components")} *
                </div>
                <button
                  type="button"
                  onClick={addComponent}
                  style={{ padding: "8px 10px", borderRadius: "10px", border: "1px solid #e5e7eb", backgroundColor: "#ffffff", cursor: "pointer", fontWeight: 900 }}
                >
                  <Plus style={{ width: 14, height: 14 }} />
                </button>
              </div>

              {formData.components.length === 0 ? (
                <div style={{ fontSize: "12px", color: "#6b7280" }}>{t("admin.dealManagement.noComponents")}</div>
              ) : null}

              {formData.components.map((component: any, index) => (
                <div key={index} style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px", backgroundColor: "#f9fafb" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 900, color: "#6b7280" }}>
                      {t("admin.dealManagement.componentNumber", { index: index + 1 })}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeComponent(index)}
                      style={{ padding: "6px", border: "none", backgroundColor: "#fee2e2", borderRadius: "10px", cursor: "pointer" }}
                    >
                      <X style={{ width: 14, height: 14, color: "#991b1b" }} />
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 140px 140px", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 900, color: "#111827", marginBottom: "6px" }}>
                        {t("common.name")}
                      </label>
                      <input
                        value={component.name}
                        onChange={(e) => updateComponent(index, "name", e.target.value)}
                        placeholder={t("admin.dealManagement.componentNamePlaceholder")}
                        style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", outline: "none" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 900, color: "#111827", marginBottom: "6px" }}>
                        {t("admin.dealManagement.fields.quantity")}
                      </label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={componentQtyInputs[index] ?? String(component.quantity ?? 1)}
                        onChange={(e) => {
                          const value = e.target.value;
                          setComponentQtyInputs((prev) => ({ ...prev, [index]: value }));
                          const parsed = Math.max(1, parseInt(value || "1", 10) || 1);
                          updateComponent(index, "quantity" as any, parsed);
                        }}
                        style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", outline: "none" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 900, color: "#111827", marginBottom: "6px" }}>
                        {t("admin.dealManagement.fields.price")}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={componentPriceInputs[index] ?? String(component.price ?? 0)}
                        onChange={(e) => {
                          const value = e.target.value;
                          setComponentPriceInputs((prev) => ({ ...prev, [index]: value }));
                          updateComponent(index, "price", value === "" ? 0 : parseFloat(value) || 0);
                        }}
                        style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", outline: "none" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 900, color: "#111827", marginBottom: "6px" }}>
                        {t("admin.dealManagement.fields.taxPercent")}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        value={componentTaxInputs[index] ?? String(component.taxPercentage ?? 0)}
                        onChange={(e) => {
                          const value = e.target.value;
                          setComponentTaxInputs((prev) => ({ ...prev, [index]: value }));
                          updateComponent(index, "taxPercentage", value === "" ? 0 : parseFloat(value) || 0);
                        }}
                        style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", outline: "none" }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {formData.components.length > 0 ? (
                <div style={{ textAlign: "right", fontSize: "13px", fontWeight: 900, color: "#ec4899" }}>
                  {t("admin.dealManagement.total")}: {formatPrice(getDealTotalPrice(), currency)}
                </div>
              ) : null}
            </div>
          )}

          {dealDialogTab === "availability" && (
            <div>
              <div style={{ fontSize: "13px", fontWeight: 900, color: "#111827", marginBottom: "6px" }}>
                {t("admin.dealManagement.excludedBranches")}
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "10px" }}>
                {t("admin.dealManagement.excludedBranchesHint")}
              </div>

              <div style={{ maxHeight: "260px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "8px" }}>
                {branches.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "#6b7280", padding: "10px" }}>
                    {t("admin.dealManagement.noBranches")}
                  </div>
                ) : (
                  branches.map((branch) => {
                    const isExcluded = formData.excludedBranches?.includes(branch.id);
                    return (
                      <div
                        key={branch.id}
                        onClick={() => toggleExcludedBranch(branch.id)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "10px",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "6px",
                          backgroundColor: isExcluded ? "#fce7f3" : "transparent",
                          border: isExcluded ? "1px solid #ec4899" : "1px solid transparent",
                        }}
                      >
                        <div style={{ fontSize: "13px", fontWeight: 800, color: "#111827" }}>{branch.name}</div>
                        {isExcluded ? <Check style={{ width: 16, height: 16, color: "#ec4899" }} /> : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {dealDialogTab === "addons" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 900, color: "#111827", marginBottom: "8px" }}>
                  {t("admin.dealManagement.addonsOptional")}
                </div>

                <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px" }}>
                  {filteredAddons.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>{t("admin.dealManagement.noAddons")}</div>
                  ) : (
                    filteredAddons.map((addon) => {
                      const checked = formData.addOnIds?.includes(addon.id) || false;
                      return (
                        <label key={addon.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 6px", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setFormData({
                                ...formData,
                                addOnIds: toggleStringId(formData.addOnIds, addon.id),
                              })
                            }
                          />
                          <span style={{ fontSize: "13px", color: "#111827", fontWeight: 800 }}>{addon.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "13px", fontWeight: 900, color: "#111827", marginBottom: "8px" }}>
                  {t("admin.dealManagement.declarations")}
                </div>

                <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px" }}>
                  {filteredDeclarations.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>{t("admin.dealManagement.noDeclarations")}</div>
                  ) : (
                    filteredDeclarations.map((decl) => {
                      const checked = formData.declarationIds?.includes(decl.id) || false;
                      return (
                        <label key={decl.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 6px", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setFormData({
                                ...formData,
                                declarationIds: toggleStringId(formData.declarationIds, decl.id),
                              })
                            }
                          />
                          <span style={{ fontSize: "13px", color: "#111827", fontWeight: 800 }}>
                            {(decl.icon ? `${decl.icon} ` : "") + decl.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "13px", fontWeight: 900, color: "#111827", marginBottom: "8px" }}>
                  {t("admin.dealManagement.optionalIngredients")}
                </div>

                <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px" }}>
                  {filteredOptionalIngredients.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>{t("admin.dealManagement.noOptionalIngredients")}</div>
                  ) : (
                    filteredOptionalIngredients.map((ing) => {
                      const checked = formData.optionalIngredientIds?.includes(ing.id) || false;
                      return (
                        <label key={ing.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 6px", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setFormData({
                                ...formData,
                                optionalIngredientIds: toggleStringId(formData.optionalIngredientIds, ing.id),
                              })
                            }
                          />
                          <span style={{ fontSize: "13px", color: "#111827", fontWeight: 800 }}>{ing.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
            <button
              type="button"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setIsEditDialogOpen(false);
                resetForm();
              }}
              disabled={isSubmitting}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                fontWeight: 800,
              }}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #ec4899",
                backgroundColor: "#ec4899",
                color: "#ffffff",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                fontWeight: 900,
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting
                ? t("common.saving")
                : selectedDeal
                ? t("admin.dealManagement.updateDeal")
                : t("admin.dealManagement.createDeal")}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setDealToDelete(null);
        }}
        title={t("admin.dealManagement.deleteDealTitle")}
      >
        <p style={{ fontSize: "14px", color: "#6b7280", marginTop: 0 }}>
          {t("admin.dealManagement.deleteDealConfirm", { name: dealToDelete?.name || "" })}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            type="button"
            onClick={() => {
              setIsDeleteDialogOpen(false);
              setDealToDelete(null);
            }}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #dc2626",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            {t("common.delete")}
          </button>
        </div>
      </Dialog>

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

export default DealManagement;
