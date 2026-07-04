import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@mdi/react";
import { mdiPackageVariant, mdiPlus, mdiMagnify, mdiDotsVertical, mdiPencil, mdiDelete, mdiEye, mdiEyeOff, mdiChevronLeft, mdiChevronRight, mdiRefresh, mdiSort, mdiFormatListNumbered } from "@mdi/js";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { categoryService } from "@/services/categoryService";
import type { Category, CategoryFormData } from "@/services/categoryService";
import branchService, { type Branch, type Organization } from "@/services/branchService";
import ImageUpload from "@/components/ui/image-upload";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import { toast } from "sonner";
import OrganizationSearchSelect from "@/components/OrganizationSearchSelect";

const CategoryManagement: React.FC = () => {
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const { canAny, isSuperAdmin } = usePermissions();
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<"name" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [openCategoryMenuId, setOpenCategoryMenuId] = useState<string | null>(null);

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [categoryToMove, setCategoryToMove] = useState<Category | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [targetOrganizationId, setTargetOrganizationId] = useState<string>("");
  const [moving, setMoving] = useState(false);

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    new Set()
  );
  const [bulkMoveDialogOpen, setBulkMoveDialogOpen] = useState(false);
  const [bulkTargetOrganizationId, setBulkTargetOrganizationId] = useState<string>(
    ""
  );
  const [bulkMoving, setBulkMoving] = useState(false);

  const [bulkCopyDialogOpen, setBulkCopyDialogOpen] = useState(false);
  const [bulkCopyTargetOrganizationId, setBulkCopyTargetOrganizationId] = useState<string>(
    ""
  );
  const [bulkCopying, setBulkCopying] = useState(false);

  const handleSort = (field: "name" | "createdAt") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  const toggleSelectedCategory = (id: string, checked: boolean) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const setAllSelectedCategoriesOnPage = (checked: boolean) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        categories.forEach((c) => next.add(c.id));
      } else {
        categories.forEach((c) => next.delete(c.id));
      }
      return next;
    });
  };

  const openBulkMoveCategories = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setBulkTargetOrganizationId("");
      setBulkMoveDialogOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load organizations");
    }
  };

  const openBulkCopyCategories = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setBulkCopyTargetOrganizationId("");
      setBulkCopyDialogOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load organizations");
    }
  };

  const handleBulkMoveCategories = async () => {
    const ids = Array.from(selectedCategoryIds);
    if (ids.length === 0) return;
    if (!bulkTargetOrganizationId) {
      toast.error(
        t("admin.categoryManagement.selectOrganization", {
          defaultValue: "Select an organization",
        })
      );
      return;
    }

    setBulkMoving(true);
    try {
      const token = await getToken();
      if (!token) return;

      const results = await Promise.allSettled(
        ids.map((id) =>
          categoryService.setCategoryOrganization(
            id,
            bulkTargetOrganizationId,
            token || undefined
          )
        )
      );

      const failedCount = results.filter((r) => r.status === "rejected").length;
      if (failedCount > 0) {
        toast.error(
          t("admin.categoryManagement.bulkMoveFailed", {
            defaultValue: "Some categories failed to move",
          })
        );
      } else {
        toast.success(
          t("admin.categoryManagement.bulkMoved", {
            defaultValue: "Categories moved",
          })
        );
      }

      setBulkMoveDialogOpen(false);
      setSelectedCategoryIds(new Set());
      await fetchCategories();
    } finally {
      setBulkMoving(false);
    }
  };

  const handleBulkCopyCategories = async () => {
    const ids = Array.from(selectedCategoryIds);
    if (ids.length === 0) return;
    if (!bulkCopyTargetOrganizationId) {
      toast.error(
        t("admin.categoryManagement.selectOrganization", {
          defaultValue: "Select an organization",
        })
      );
      return;
    }

    setBulkCopying(true);
    try {
      const token = await getToken();
      if (!token) return;

      await categoryService.copyCategoriesToOrganization(
        ids,
        bulkCopyTargetOrganizationId,
        token || undefined
      );

      toast.success(
        t("admin.categoryManagement.bulkCopied", {
          defaultValue: "Categories copied",
        })
      );

      setBulkCopyDialogOpen(false);
      setSelectedCategoryIds(new Set());
      await fetchCategories();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t("admin.categoryManagement.bulkCopyFailed", {
            defaultValue: "Some categories failed to copy",
          })
      );
    } finally {
      setBulkCopying(false);
    }
  };

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Form states
  const [formData, setFormData] = useState<CategoryFormData>({
    name: "",
    nameFa: "",
    description: "",
    descriptionFa: "",
    image: "",
    taxPercentage: null,
    excludedBranches: [],
    isActive: true,
    isFeatured: false,
  });

  const canCreateCategory = canAny([
    { resource: RESOURCES.CATEGORIES, action: ACTIONS.CREATE },
  ]);
  const canDeleteCategory = canAny([
    { resource: RESOURCES.CATEGORIES, action: ACTIONS.DELETE },
  ]);
  const canToggleCategory = canAny([
    { resource: RESOURCES.CATEGORIES, action: ACTIONS.TOGGLE_ACTIVE },
  ]);
  const canCategoryOrdering = canAny([
    { resource: RESOURCES.CATEGORIES, action: ACTIONS.ORDERING },
  ]);

  // Fetch categories
  const fetchCategories = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await categoryService.getCategories(
        currentPage,
        10,
        searchTerm,
        sortBy,
        sortOrder,
        token || undefined
      );

      setCategories(response.categories);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [currentPage, searchTerm, sortBy, sortOrder, selectedStatus]);

  // Handle search
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const token = await getToken();

      if (selectedCategory) {
        // Update existing category
        await categoryService.updateCategory(
          selectedCategory.id,
          formData,
          token || undefined
        );
      } else {
        // Create new category
        await categoryService.createCategory(formData, token || undefined);
      }

      // Close dialogs and reset form
      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      resetForm();

      // Refresh categories list
      await fetchCategories();
    } catch (error) {
      console.error("Error saving category:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit
  const handleEdit = async (category: Category) => {
    // Load branches when opening edit dialog
    try {
      const token = await getToken();
      const branchesData = await branchService.getBranches(token || undefined);
      setBranches(branchesData || []);
    } catch (error) {
      console.error("Failed to load branches", error);
    }
    setSelectedCategory(category);
    setFormData({
      name: category.name,
      nameFa: category.nameFa || "",
      description: category.description || "",
      descriptionFa: category.descriptionFa || "",
      image: category.image || "",
      taxPercentage: category.taxPercentage,
      excludedBranches: category.excludedBranches || [],
      isActive: category.isActive,
      isFeatured:
        category.isFeatured !== undefined ? category.isFeatured : false,
    });
    setIsEditDialogOpen(true);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!categoryToDelete) return;
    try {
      const token = await getToken();
      await categoryService.deleteCategory(categoryToDelete.id, token || undefined);
      await fetchCategories();
      setIsDeleteDialogOpen(false);
      setCategoryToDelete(null);
    } catch (error) {
      console.error("Error deleting category:", error);
    }
  };

  const handleDeleteClick = (category: Category) => {
    setCategoryToDelete(category);
    setIsDeleteDialogOpen(true);
  };

  // Handle toggle status
  const handleToggleStatus = async (category: Category) => {
    try {
      const token = await getToken();
      await categoryService.toggleCategoryStatus(
        category.id,
        token || undefined
      );
      await fetchCategories();
    } catch (error) {
      console.error("Error toggling category status:", error);
    }
  };

  const openMoveCategory = async (category: Category) => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || ([] as any));
      setCategoryToMove(category);
      setTargetOrganizationId(category.organizationId || "");
      setMoveDialogOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load organizations");
    }
  };

  const handleMoveCategory = async () => {
    if (!categoryToMove) return;
    if (!targetOrganizationId) {
      toast.error(t("admin.categoryManagement.selectOrganization", { defaultValue: "Select an organization" }));
      return;
    }

    setMoving(true);
    try {
      const token = await getToken();
      await categoryService.setCategoryOrganization(
        categoryToMove.id,
        targetOrganizationId,
        token || undefined
      );
      toast.success(t("admin.categoryManagement.moved", { defaultValue: "Category moved" }));
      setMoveDialogOpen(false);
      setCategoryToMove(null);
      await fetchCategories();
    } catch (e: any) {
      toast.error(e?.message || "Failed to move category");
    } finally {
      setMoving(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      nameFa: "",
      description: "",
      descriptionFa: "",
      image: "",
      taxPercentage: null,
      excludedBranches: [],
      isActive: true,
      isFeatured: false,
    });
    setSelectedCategory(null);
  };

  // Toggle excluded branch
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

  // Handle create new
  const handleCreateNew = async () => {
    try {
      const token = await getToken();
      const branchesData = await branchService.getBranches(token || undefined);
      setBranches(branchesData || []);
    } catch (error) {
      console.error("Failed to load branches", error);
      setBranches([]);
    }
    resetForm();
    setIsCreateDialogOpen(true);
  };

  if (loading && categories.length === 0) {
    return (
      <div className="space-y-4 pb-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-pink-500">
              {t("admin.categoryManagement.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryManagement.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              {t("admin.categoryManagement.loading")}
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
                  placeholder={t("admin.categoryManagement.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleSearch(e.target.value)
                  }
                  className="pl-9 bg-transparent text-foreground border-border"
                />
              </div>

              {/* Filter Dropdowns */}
              <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
                <Select
                  value={selectedStatus || "all"}
                  onValueChange={(value: string) => {
                    setSelectedStatus(value === "all" ? "" : value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue
                      placeholder={t("admin.categoryManagement.allStatus")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("admin.categoryManagement.allStatus")}
                    </SelectItem>
                    <SelectItem value="ACTIVE">
                      {t("admin.categoryManagement.active")}
                    </SelectItem>
                    <SelectItem value="INACTIVE">
                      {t("admin.categoryManagement.inactive")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">{t("admin.categoryManagement.sortBy")}:</span>
                <Button
                  size="sm"
                  onClick={() => handleSort("name")}
                  className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  <span className={sortBy === "name" ? "text-white" : ""}>
                    {t("admin.categoryManagement.nameAZ")}
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
                        ? t("admin.categoryManagement.newestFirst")
                        : t("admin.categoryManagement.oldestFirst")
                      : t("admin.categoryManagement.newestFirst")}
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
              {t("admin.categoryManagement.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryManagement.loadingDescription")}
            </p>
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
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.categoryManagement.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.categoryManagement.description")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canCategoryOrdering && (
            <Button
              variant="outline"
              asChild
              className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
            >
              <Link to="/admin/categories/ordering" className="flex items-center">
                <Icon path={mdiFormatListNumbered} size={0.67} className="mr-2" />
                {t("admin.categoryManagement.ordering.title")}
              </Link>
            </Button>
          )}
          {canCreateCategory && (
            <Button
              onClick={handleCreateNew}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              <Icon path={mdiPlus} size={0.67} className="mr-2" />
              {t("admin.categoryManagement.addCategory")}
            </Button>
          )}
        </div>
      </div>

      {isSuperAdmin && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={
                    categories.length > 0 &&
                    categories.every((c) => selectedCategoryIds.has(c.id))
                  }
                  onCheckedChange={(checked) =>
                    setAllSelectedCategoriesOnPage(Boolean(checked))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {t("admin.categoryManagement.selectedCount", {
                    defaultValue: "Selected: {{count}}",
                    count: selectedCategoryIds.size,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setSelectedCategoryIds(new Set())}
                  disabled={selectedCategoryIds.size === 0}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  {t("admin.categoryManagement.clearSelection", {
                    defaultValue: "Clear",
                  })}
                </Button>
                <Button
                  type="button"
                  onClick={openBulkMoveCategories}
                  disabled={selectedCategoryIds.size === 0}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {t("admin.categoryManagement.moveSelected", {
                    defaultValue: "Move selected",
                  })}
                </Button>
                <Button
                  type="button"
                  onClick={openBulkCopyCategories}
                  disabled={selectedCategoryIds.size === 0}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  {t("admin.categoryManagement.copySelected", {
                    defaultValue: "Copy selected",
                  })}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.categoryManagement.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9 bg-transparent text-foreground border-border"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
              <Select
                value={selectedStatus || "all"}
                onValueChange={(value: string) => {
                  setSelectedStatus(value === "all" ? "" : value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.categoryManagement.allStatus")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.categoryManagement.allStatus")}
                  </SelectItem>
                  <SelectItem value="ACTIVE">
                    {t("admin.categoryManagement.active")}
                  </SelectItem>
                  <SelectItem value="INACTIVE">
                    {t("admin.categoryManagement.inactive")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">{t("admin.categoryManagement.sortBy")}:</span>
              <Button
                size="sm"
                onClick={() => handleSort("name")}
                className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
              >
                <span className={sortBy === "name" ? "text-white" : ""}>
                  {t("admin.categoryManagement.nameAZ")}
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
                      ? t("admin.categoryManagement.newestFirst")
                      : t("admin.categoryManagement.oldestFirst")
                    : t("admin.categoryManagement.newestFirst")}
                </span>
                {sortBy === "createdAt" && (
                  <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Icon path={mdiPackageVariant} size={2.0} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.categoryManagement.noCategoriesFound", {
                defaultValue: "No categories found",
              })}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchTerm
                ? t("admin.categoryManagement.tryAdjustingFilters", {
                    defaultValue: "Try adjusting your search or filters.",
                  })
                : t("admin.categoryManagement.getStarted", {
                    defaultValue: "Get started by creating your first category.",
                  })}
            </p>
            {!searchTerm && canCreateCategory && (
              <Button
                onClick={handleCreateNew}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                <Icon path={mdiPlus} size={0.67} className="mr-2" />
                {t("admin.categoryManagement.addCategory")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((category) => (
            <Card
              key={category.id}
              className="overflow-hidden border-border/60 bg-card/70 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              <div className="relative h-40">
                {category.image ? (
                  <img
                    src={(() => {
                      const imgUrl = isExternalImage(category.image)
                        ? category.image
                        : getOptimizedImageUrl(category.image);
                      return imgUrl;
                    })()}
                    alt={category.name}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      console.error("Image failed to load:", {
                        src: e.currentTarget.src,
                        categoryName: category.name,
                      });
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-linear-to-br from-muted to-muted/40" />
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/30 to-black/10" />

                <div className="absolute left-3 top-3 right-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isSuperAdmin && (
                      <div className="rounded-md bg-black/30 p-1.5 backdrop-blur">
                        <Checkbox
                          checked={selectedCategoryIds.has(category.id)}
                          onCheckedChange={(checked) =>
                            toggleSelectedCategory(category.id, Boolean(checked))
                          }
                        />
                      </div>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide",
                        category.isActive
                          ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30"
                          : "bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/30"
                      )}
                    >
                      {category.isActive
                        ? t("admin.categoryManagement.active")
                        : t("admin.categoryManagement.inactive")}
                    </span>
                    {category.isFeatured && (
                      <span
                        className="inline-flex items-center justify-center rounded-full bg-pink-500/25 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-pink-400/30"
                        title={t("admin.categoryManagement.isFeatured")}
                      >
                        <Icon path={mdiEye} size={0.6} />
                      </span>
                    )}
                  </div>

                  <DropdownMenu
                    open={openCategoryMenuId === category.id}
                    onOpenChange={(open) => {
                      setOpenCategoryMenuId(open ? category.id : null);
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
                          setOpenCategoryMenuId((prev) =>
                            prev === category.id ? null : category.id
                          );
                        }}
                      >
                        <Icon path={mdiDotsVertical} size={0.75} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setOpenCategoryMenuId(null);
                          handleEdit(category);
                        }}
                      >
                        <Icon path={mdiPencil} size={0.67} className="mr-2" />
                        {t("admin.categoryManagement.edit")}
                      </DropdownMenuItem>
                      {isSuperAdmin && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenCategoryMenuId(null);
                            openMoveCategory(category);
                          }}
                        >
                          <Icon path={mdiFormatListNumbered} size={0.67} className="mr-2" />
                          {t("admin.categoryManagement.moveOrganization", { defaultValue: "Move to organization" })}
                        </DropdownMenuItem>
                      )}
                      {canToggleCategory && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenCategoryMenuId(null);
                            handleToggleStatus(category);
                          }}
                        >
                          {category.isActive ? (
                            <>
                              <Icon path={mdiEyeOff} size={0.67} className="mr-2" />
                              {t("admin.categoryManagement.deactivate")}
                            </>
                          ) : (
                            <>
                              <Icon path={mdiEye} size={0.67} className="mr-2" />
                              {t("admin.categoryManagement.activate")}
                            </>
                          )}
                        </DropdownMenuItem>
                      )}
                      {canDeleteCategory && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenCategoryMenuId(null);
                            handleDeleteClick(category);
                          }}
                          className="text-red-600 dark:text-red-400"
                        >
                          <Icon path={mdiDelete} size={0.67} className="mr-2" />
                          {t("admin.categoryManagement.delete")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="absolute bottom-3 left-3 right-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-white leading-tight line-clamp-1">
                        {category.name}
                      </div>
                      <div className="mt-0.5 text-[12px] text-white/80">
                        {t("admin.categoryManagement.meals")}: {category._count.meals}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <CardContent className="p-3">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-5">
                    {category.description || t("admin.menuCategories.noDescription")}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">
                      {category._count.meals}{" "}
                      {t("admin.categoryManagement.meals")}
                    </span>
                    <span>
                      {new Date(category.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("admin.categoryManagement.showingCategories", {
              count: categories.length,
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
              {t("admin.categoryManagement.pageOf", {
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

      {/* Create Category Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open: boolean) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md bg-card text-foreground border-border max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.categoryManagement.createNewCategory")}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryManagement.createCategoryDescription")}
            </p>
          </DialogHeader>
          <form
            onSubmit={handleSubmit}
            className="space-y-6 overflow-y-auto pr-2 pb-2"
          >
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                {t("admin.categoryManagement.categoryName")}{" "}
                <span className="text-red-500">
                  {t("admin.categoryManagement.required")}
                </span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t(
                  "admin.categoryManagement.categoryNamePlaceholder"
                )}
                required
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                {t("admin.categoryManagement.descriptionLabel")}
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t(
                  "admin.categoryManagement.descriptionPlaceholder"
                )}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
              />
            </div>

            {/* Persian Fields Section */}
            <div className="border-t border-border pt-4 mt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("admin.categoryManagement.persianSectionTitle")}</h3>
              <div className="space-y-2">
              <Label htmlFor="nameFa" className="text-sm font-medium">
                {t("admin.categoryManagement.categoryNameFa")}
              </Label>
              <Input
                id="nameFa"
                value={formData.nameFa || ""}
                onChange={(e) =>
                  setFormData({ ...formData, nameFa: e.target.value })
                }
                placeholder={t(
                  "admin.categoryManagement.categoryNameFaPlaceholder"
                )}
                className="bg-transparent text-foreground border-border"
                dir="rtl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descriptionFa" className="text-sm font-medium">
                {t("admin.categoryManagement.descriptionLabelFa")}
              </Label>
              <Textarea
                id="descriptionFa"
                value={formData.descriptionFa || ""}
                onChange={(e) =>
                  setFormData({ ...formData, descriptionFa: e.target.value })
                }
                placeholder={t(
                  "admin.categoryManagement.descriptionPlaceholderFa"
                )}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
                dir="rtl"
              />
            </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxPercentage" className="text-sm font-medium">
                {t("admin.categoryManagement.taxPercentage")}
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
                placeholder={t(
                  "admin.categoryManagement.taxPercentagePlaceholder"
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.categoryManagement.taxPercentageHint")}
              </p>
            </div>

            <div className="space-y-2">
              <ImageUpload
                value={formData.image}
                onChange={(value) => setFormData({ ...formData, image: value })}
                label={t("admin.categoryManagement.categoryImage")}
              />
            </div>

            {canToggleCategory && (
              <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({ ...formData, isActive: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-border text-pink-500 focus:ring-pink-500 focus:ring-2"
                />
                <Label
                  htmlFor="isActive"
                  className="text-sm font-medium cursor-pointer"
                >
                  {t("admin.categoryManagement.makeActive")}
                </Label>
              </div>
            )}

            {canCategoryOrdering && (
              <div className="flex items-center justify-between space-y-0 rounded-md border border-border p-4">
                <div className="space-y-0.5 flex-1 pr-4">
                  <Label htmlFor="isFeatured" className="text-sm font-medium">
                    {t("admin.categoryManagement.isFeatured")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.categoryManagement.isFeaturedDescription")}
                  </p>
                </div>
                <Switch
                  id="isFeatured"
                  checked={
                    formData.isFeatured !== undefined
                      ? formData.isFeatured
                      : false
                  }
                  onCheckedChange={(checked: boolean) =>
                    setFormData({ ...formData, isFeatured: checked })
                  }
                />
              </div>
            )}

            {/* Excluded Branches Section */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                {t("admin.categoryManagement.excludedBranches")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.categoryManagement.excludedBranchesDescription")}
              </p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 space-y-2">
                {branches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t("admin.categoryManagement.noBranchesAvailable")}
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
                    {t("admin.categoryManagement.excludedBranches")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.categoryManagement.branchesExcluded", {
                      count: formData.excludedBranches?.length || 0,
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                onClick={() => {
                  setIsCreateDialogOpen(false);
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
                  ? t("admin.categoryManagement.creating")
                  : t("admin.categoryManagement.createCategory")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkMoveDialogOpen} onOpenChange={setBulkMoveDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.categoryManagement.moveSelected", {
                defaultValue: "Move selected",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryManagement.selectedCount", {
                defaultValue: "Selected: {{count}}",
                count: selectedCategoryIds.size,
              })}
            </p>
            <div className="space-y-2">
              <Label>
                {t("admin.categoryManagement.targetOrganization", {
                  defaultValue: "Target organization",
                })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={bulkTargetOrganizationId}
                onValueChange={setBulkTargetOrganizationId}
                placeholder={t("admin.categoryManagement.selectOrganization", {
                  defaultValue: "Select organization",
                })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setBulkMoveDialogOpen(false)}
                disabled={bulkMoving}
                className="bg-transparent hover:bg-muted text-foreground border border-border h-10"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleBulkMoveCategories}
                disabled={bulkMoving}
                className="bg-pink-500 hover:bg-pink-600 text-white h-10"
              >
                {bulkMoving
                  ? t("common.loading")
                  : t("common.save", { defaultValue: "Save" })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open: boolean) => {
          setIsEditDialogOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md bg-card text-foreground border-border max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.categoryManagement.editCategory")}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryManagement.editCategoryDescription")}
            </p>
          </DialogHeader>
          <form
            onSubmit={handleSubmit}
            className="space-y-6 overflow-y-auto pr-2 pb-2"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-sm font-medium">
                {t("admin.categoryManagement.categoryName")}{" "}
                <span className="text-red-500">
                  {t("admin.categoryManagement.required")}
                </span>
              </Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t(
                  "admin.categoryManagement.categoryNamePlaceholder"
                )}
                required
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description" className="text-sm font-medium">
                {t("admin.categoryManagement.descriptionLabel")}
              </Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t(
                  "admin.categoryManagement.descriptionPlaceholder"
                )}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
              />
            </div>

            {/* Persian Fields Section */}
            <div className="border-t border-border pt-4 mt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("admin.categoryManagement.persianSectionTitle")}</h3>
              <div className="space-y-2">
              <Label htmlFor="edit-nameFa" className="text-sm font-medium">
                {t("admin.categoryManagement.categoryNameFa")}
              </Label>
              <Input
                id="edit-nameFa"
                value={formData.nameFa || ""}
                onChange={(e) =>
                  setFormData({ ...formData, nameFa: e.target.value })
                }
                placeholder={t(
                  "admin.categoryManagement.categoryNameFaPlaceholder"
                )}
                className="bg-transparent text-foreground border-border"
                dir="rtl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-descriptionFa" className="text-sm font-medium">
                {t("admin.categoryManagement.descriptionLabelFa")}
              </Label>
              <Textarea
                id="edit-descriptionFa"
                value={formData.descriptionFa || ""}
                onChange={(e) =>
                  setFormData({ ...formData, descriptionFa: e.target.value })
                }
                placeholder={t(
                  "admin.categoryManagement.descriptionPlaceholderFa"
                )}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
                dir="rtl"
              />
            </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="edit-taxPercentage"
                className="text-sm font-medium"
              >
                {t("admin.categoryManagement.taxPercentage")}
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
                placeholder={t(
                  "admin.categoryManagement.taxPercentagePlaceholder"
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.categoryManagement.taxPercentageHint")}
              </p>
            </div>

            <div className="space-y-2">
              <ImageUpload
                value={formData.image}
                onChange={(value) => setFormData({ ...formData, image: value })}
                label={t("admin.categoryManagement.categoryImage")}
              />
            </div>

            {canToggleCategory && (
              <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
                <input
                  type="checkbox"
                  id="edit-isActive"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({ ...formData, isActive: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-border text-pink-500 focus:ring-pink-500 focus:ring-2"
                />
                <Label
                  htmlFor="edit-isActive"
                  className="text-sm font-medium cursor-pointer"
                >
                  {t("admin.categoryManagement.makeActive")}
                </Label>
              </div>
            )}

            {canCategoryOrdering && (
              <div className="flex items-center justify-between space-y-0 rounded-md border border-border p-4">
                <div className="space-y-0.5 flex-1 pr-4">
                  <Label
                    htmlFor="edit-isFeatured"
                    className="text-sm font-medium"
                  >
                    {t("admin.categoryManagement.isFeatured")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.categoryManagement.isFeaturedDescription")}
                  </p>
                </div>
                <Switch
                  id="edit-isFeatured"
                  checked={
                    formData.isFeatured !== undefined
                      ? formData.isFeatured
                      : false
                  }
                  onCheckedChange={(checked: boolean) =>
                    setFormData({ ...formData, isFeatured: checked })
                  }
                />
              </div>
            )}

            {/* Excluded Branches Section */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                {t("admin.categoryManagement.excludedBranches")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.categoryManagement.excludedBranchesDescription")}
              </p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 space-y-2">
                {branches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t("admin.categoryManagement.noBranchesAvailable")}
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
                    {t("admin.categoryManagement.excludedBranches")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.categoryManagement.branchesExcluded", {
                      count: formData.excludedBranches?.length || 0,
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                onClick={() => {
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
                  ? t("admin.categoryManagement.updating")
                  : t("admin.categoryManagement.updateCategory")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.categoryManagement.moveOrganization", { defaultValue: "Move to organization" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{categoryToMove?.name}</p>
            <div className="space-y-2">
              <Label>
                {t("admin.categoryManagement.targetOrganization", { defaultValue: "Target organization" })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={targetOrganizationId}
                onValueChange={setTargetOrganizationId}
                placeholder={t("admin.categoryManagement.selectOrganization", {
                  defaultValue: "Select organization",
                })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setMoveDialogOpen(false);
                  setCategoryToMove(null);
                }}
                disabled={moving}
                className="bg-transparent hover:bg-muted text-foreground border border-border h-10"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleMoveCategory}
                disabled={moving}
                className="bg-pink-500 hover:bg-pink-600 text-white h-10"
              >
                {moving ? t("common.loading") : t("common.save", { defaultValue: "Save" })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Category Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.categoryManagement.deleteCategory")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              {t(
                "admin.categoryManagement.deleteCategoryDescription",
                { name: categoryToDelete?.name || "" }
              )}
              {categoryToDelete && categoryToDelete._count.meals > 0 && (
                <span className="block mt-2 text-red-600 dark:text-red-400">
                  {t(
                    "admin.categoryManagement.deleteCategoryWarning",
                    { count: categoryToDelete._count.meals }
                  )}
                </span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setCategoryToDelete(null);
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t(
                  "admin.categoryManagement.deleteCategoryCancel"
                )}
              </Button>
              <Button
                onClick={handleDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {t(
                  "admin.categoryManagement.deleteCategoryConfirm"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkCopyDialogOpen} onOpenChange={setBulkCopyDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.categoryManagement.copySelected", {
                defaultValue: "Copy selected",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryManagement.selectedCount", {
                defaultValue: "Selected: {{count}}",
                count: selectedCategoryIds.size,
              })}
            </p>
            <div className="space-y-2">
              <Label>
                {t("admin.categoryManagement.targetOrganization", {
                  defaultValue: "Target organization",
                })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={bulkCopyTargetOrganizationId}
                onValueChange={setBulkCopyTargetOrganizationId}
                placeholder={t("admin.categoryManagement.selectOrganization", {
                  defaultValue: "Select organization",
                })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setBulkCopyDialogOpen(false)}
                disabled={bulkCopying}
                className="bg-transparent hover:bg-muted text-foreground border border-border h-10"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleBulkCopyCategories}
                disabled={bulkCopying}
                className="bg-pink-500 hover:bg-pink-600 text-white h-10"
              >
                {bulkCopying ? t("common.loading") : t("common.save", { defaultValue: "Save" })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CategoryManagement;
