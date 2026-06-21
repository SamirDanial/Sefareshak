import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Checkbox } from "@/components/ui/checkbox";
import OrganizationSearchSelect from "@/components/OrganizationSearchSelect";
import Icon from "@mdi/react";
import { mdiTag, mdiPlus, mdiMagnify, mdiDotsVertical, mdiPencil, mdiDelete, mdiChevronLeft, mdiChevronRight, mdiRefresh, mdiEye, mdiEyeOff, mdiSort } from "@mdi/js";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  declarationService,
  type Declaration,
  type DeclarationFormData,
} from "@/services/declarationService";
import branchService, { type Branch, type Organization } from "@/services/branchService";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";

const DeclarationManagement: React.FC = () => {
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const { canAny, isSuperAdmin } = usePermissions();

  const truncateText = (value: string, maxLength: number) => {
    const text = value ?? "";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  };

  const canCreateDeclaration = canAny([
    { resource: RESOURCES.DECLARATIONS, action: ACTIONS.CREATE },
  ]);
  const canUpdateDeclaration = canAny([
    { resource: RESOURCES.DECLARATIONS, action: ACTIONS.UPDATE },
  ]);
  const canDeleteDeclaration = canAny([
    { resource: RESOURCES.DECLARATIONS, action: ACTIONS.DELETE },
  ]);

  const canManageDeclarationActions =
    canUpdateDeclaration || canDeleteDeclaration || isSuperAdmin;
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [allDeclarations, setAllDeclarations] = useState<Declaration[]>([]); // For getting unique types
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<"name" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [openDeclarationMobileMenuId, setOpenDeclarationMobileMenuId] =
    useState<string | null>(null);
  const [openDeclarationDesktopMenuId, setOpenDeclarationDesktopMenuId] =
    useState<string | null>(null);

  const handleSort = (field: "name" | "createdAt") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  const toggleSelectedDeclaration = (id: string, checked: boolean) => {
    setSelectedDeclarationIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const setAllSelectedDeclarationsOnPage = (checked: boolean) => {
    setSelectedDeclarationIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        declarations.forEach((d) => next.add(d.id));
      } else {
        declarations.forEach((d) => next.delete(d.id));
      }
      return next;
    });
  };

  const openBulkMoveDeclarations = async () => {
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

  const openBulkCopyDeclarations = async () => {
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

  const handleBulkMoveDeclarations = async () => {
    const ids = Array.from(selectedDeclarationIds);
    if (ids.length === 0) return;
    if (!bulkTargetOrganizationId) {
      toast.error(
        t("admin.declarationManagement.selectOrganization", {
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
          declarationService.setDeclarationOrganization(
            id,
            bulkTargetOrganizationId,
            token || undefined
          )
        )
      );

      const failedCount = results.filter((r) => r.status === "rejected").length;
      if (failedCount > 0) {
        toast.error(
          t("admin.declarationManagement.bulkMoveFailed", {
            defaultValue: "Some declarations failed to move",
          })
        );
      } else {
        toast.success(
          t("admin.declarationManagement.bulkMoved", {
            defaultValue: "Declarations moved",
          })
        );
      }

      setBulkMoveDialogOpen(false);
      setSelectedDeclarationIds(new Set());
      await fetchDeclarations();
      await fetchAllDeclarations();
    } finally {
      setBulkMoving(false);
    }
  };

  const handleBulkCopyDeclarations = async () => {
    const ids = Array.from(selectedDeclarationIds);
    if (ids.length === 0) return;
    if (!bulkCopyTargetOrganizationId) {
      toast.error(
        t("admin.declarationManagement.selectOrganization", {
          defaultValue: "Select an organization",
        })
      );
      return;
    }

    setBulkCopying(true);
    try {
      const token = await getToken();
      if (!token) return;

      await declarationService.copyDeclarationsToOrganization(
        ids,
        bulkCopyTargetOrganizationId,
        token || undefined
      );

      toast.success(
        t("admin.declarationManagement.bulkCopied", {
          defaultValue: "Declarations copied",
        })
      );

      setBulkCopyDialogOpen(false);
      setSelectedDeclarationIds(new Set());
      await fetchDeclarations();
      await fetchAllDeclarations();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t("admin.declarationManagement.bulkCopyFailed", {
            defaultValue: "Some declarations failed to copy",
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
  const [declarationToDelete, setDeclarationToDelete] = useState<Declaration | null>(null);
  const [selectedDeclaration, setSelectedDeclaration] =
    useState<Declaration | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Move to organization states
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [declarationToMove, setDeclarationToMove] = useState<Declaration | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [targetOrganizationId, setTargetOrganizationId] = useState<string>("");
  const [moving, setMoving] = useState(false);

  const [selectedDeclarationIds, setSelectedDeclarationIds] = useState<Set<string>>(
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

  // Form states
  const [formData, setFormData] = useState<DeclarationFormData>({
    name: "",
    type: null,
    description: "",
    icon: "",
    shownInFilter: true,
    excludedBranches: [],
  });

  // Fetch all declarations for unique types (without filters)
  const fetchAllDeclarations = async () => {
    try {
      const token = await getToken();
      const all = await declarationService.getAllDeclarations(undefined, token || undefined);
      setAllDeclarations(all);
    } catch (error) {
      console.error("Error fetching all declarations:", error);
    }
  };

  // Fetch declarations
  const fetchDeclarations = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await declarationService.getDeclarations(
        currentPage,
        12,
        searchTerm,
        sortBy,
        sortOrder,
        selectedType === "all" ? "" : selectedType,
        token || undefined
      );

      setDeclarations(response.declarations);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error fetching declarations:", error);
      toast.error(t("admin.declarationManagement.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  // Fetch all declarations on mount for unique types
  useEffect(() => {
    fetchAllDeclarations();
  }, []);

  useEffect(() => {
    fetchDeclarations();
  }, [currentPage, searchTerm, sortBy, sortOrder, selectedType]);

  // Handle search
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error(t("admin.declarationManagement.nameRequired"));
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      if (selectedDeclaration) {
        // Update existing declaration
        await declarationService.updateDeclaration(
          selectedDeclaration.id,
          formData,
          token || undefined
        );
        toast.success(t("admin.declarationManagement.updatedSuccess"));
      } else {
        // Create new declaration
        await declarationService.createDeclaration(
          formData,
          token || undefined
        );
        toast.success(t("admin.declarationManagement.createdSuccess"));
      }

      // Close dialogs and reset form
      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      resetForm();

      // Refresh declarations list
      await fetchAllDeclarations();
      await fetchDeclarations();
    } catch (error: any) {
      console.error("Error saving declaration:", error);
      toast.error(
        error?.response?.data?.message ||
          t("admin.declarationManagement.failedToSave")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit
  const handleEdit = async (declaration: Declaration) => {
    // Load branches when opening edit dialog
    try {
      const token = await getToken();
      const branchesData = await branchService.getBranches(token || undefined);
      setBranches(branchesData || []);
    } catch (error) {
      console.error("Failed to load branches", error);
    }
    setSelectedDeclaration(declaration);
    setFormData({
      name: declaration.name,
      type: declaration.type || null,
      description: declaration.description || "",
      icon: declaration.icon || "",
      shownInFilter:
        declaration.shownInFilter !== undefined
          ? declaration.shownInFilter
          : true,
      excludedBranches: declaration.excludedBranches || [],
    });
    setIsEditDialogOpen(true);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!declarationToDelete) return;
    try {
      const token = await getToken();
      await declarationService.deleteDeclaration(
        declarationToDelete.id,
        token || undefined
      );
      toast.success(t("admin.declarationManagement.deletedSuccess"));
      await fetchAllDeclarations();
      await fetchDeclarations();
      setIsDeleteDialogOpen(false);
      setDeclarationToDelete(null);
    } catch (error: any) {
      console.error("Error deleting declaration:", error);
      toast.error(
        error?.response?.data?.message ||
          t("admin.declarationManagement.failedToDelete")
      );
    }
  };

  const handleDeleteClick = (declaration: Declaration) => {
    setDeclarationToDelete(declaration);
    setIsDeleteDialogOpen(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      type: null,
      description: "",
      icon: "",
      shownInFilter: true,
      excludedBranches: [],
    });
    setSelectedDeclaration(null);
  };

  // Handle create new
  const handleCreateNew = async () => {
    // Load branches when opening create dialog
    try {
      const token = await getToken();
      const branchesData = await branchService.getBranches(token || undefined);
      setBranches(branchesData || []);
    } catch (error) {
      console.error("Failed to load branches", error);
    }
    resetForm();
    setIsCreateDialogOpen(true);
  };

  // Open move declaration dialog
  const openMoveDeclaration = async (declaration: Declaration) => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setDeclarationToMove(declaration);
      setTargetOrganizationId(declaration.organizationId || "");
      setMoveDialogOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load organizations");
    }
  };

  // Handle move declaration
  const handleMoveDeclaration = async () => {
    if (!declarationToMove) return;
    if (!targetOrganizationId) {
      toast.error(t("admin.declarationManagement.selectOrganization", { defaultValue: "Select an organization" }));
      return;
    }

    setMoving(true);
    try {
      const token = await getToken();
      await declarationService.setDeclarationOrganization(
        declarationToMove.id,
        targetOrganizationId,
        token || undefined
      );
      toast.success(t("admin.declarationManagement.moved", { defaultValue: "Declaration moved" }));
      setMoveDialogOpen(false);
      setDeclarationToMove(null);
      await fetchDeclarations();
    } catch (e: any) {
      toast.error(e?.message || "Failed to move declaration");
    } finally {
      setMoving(false);
    }
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

  // Get unique types from all declarations (not filtered)
  const uniqueTypes = Array.from(
    new Set(
      allDeclarations
        .map((d) => d.type)
        .filter((t): t is string => t !== null && t !== "")
    )
  );

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.declarationManagement.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.declarationManagement.description")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canCreateDeclaration && (
            <Button
              onClick={handleCreateNew}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              <Icon path={mdiPlus} size={0.67} className="mr-2" />
              {t("admin.declarationManagement.addDeclaration")}
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
                    declarations.length > 0 &&
                    declarations.every((d) => selectedDeclarationIds.has(d.id))
                  }
                  onCheckedChange={(checked) =>
                    setAllSelectedDeclarationsOnPage(Boolean(checked))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {t("admin.declarationManagement.selectedCount", {
                    defaultValue: "Selected: {{count}}",
                    count: selectedDeclarationIds.size,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setSelectedDeclarationIds(new Set())}
                  disabled={selectedDeclarationIds.size === 0}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  {t("admin.declarationManagement.clearSelection", {
                    defaultValue: "Clear",
                  })}
                </Button>
                <Button
                  type="button"
                  onClick={openBulkMoveDeclarations}
                  disabled={selectedDeclarationIds.size === 0}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {t("admin.declarationManagement.moveSelected", {
                    defaultValue: "Move selected",
                  })}
                </Button>
                <Button
                  type="button"
                  onClick={openBulkCopyDeclarations}
                  disabled={selectedDeclarationIds.size === 0}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  {t("admin.declarationManagement.copySelected", {
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
                placeholder={t("admin.declarationManagement.searchPlaceholder")}
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
                value={selectedType}
                onValueChange={(value: string) => {
                  setSelectedType(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.declarationManagement.filterByType")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.declarationManagement.allTypes")}
                  </SelectItem>
                  {uniqueTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">{t("admin.declarationManagement.sortBy")}:</span>
              <Button
                size="sm"
                onClick={() => handleSort("name")}
                className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
              >
                <span className={sortBy === "name" ? "text-white" : ""}>
                  {t("admin.declarationManagement.nameAZ")}
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
                      ? t("admin.declarationManagement.newestFirst")
                      : t("admin.declarationManagement.oldestFirst")
                    : t("admin.declarationManagement.newestFirst")}
                </span>
                {sortBy === "createdAt" && (
                  <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.declarationManagement.loadingTitle")}
            </h3>
          </div>
        </div>
      ) : (
        <>
          {/* Declarations List */}
          {declarations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Icon path={mdiTag} size={2.00} className="mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {t("admin.declarationManagement.noDeclarationsFound")}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchTerm || selectedType !== "all"
                    ? t("admin.declarationManagement.tryAdjustingFilters")
                    : t("admin.declarationManagement.getStarted")}
                </p>
                {!searchTerm && selectedType === "all" && canCreateDeclaration && (
                  <Button
                    onClick={handleCreateNew}
                    className="bg-pink-500 hover:bg-pink-600 text-white"
                  >
                    <Icon path={mdiPlus} size={0.67} className="mr-2" />
                    {t("admin.declarationManagement.addDeclaration")}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block md:hidden space-y-3">
                {declarations.map((declaration) => (
                  <Card key={declaration.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {isSuperAdmin && (
                            <div className="pt-1">
                              <Checkbox
                                checked={selectedDeclarationIds.has(declaration.id)}
                                onCheckedChange={(checked) =>
                                  toggleSelectedDeclaration(
                                    declaration.id,
                                    Boolean(checked)
                                  )
                                }
                              />
                            </div>
                          )}
                          {declaration.icon && (
                            <span className="text-2xl flex-shrink-0">
                              {declaration.icon}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-sm truncate">
                                {declaration.name}
                              </h3>
                              <span
                                className={`inline-flex items-center justify-center w-5 h-5 rounded-full border flex-shrink-0 ${
                                  declaration.shownInFilter === true
                                    ? "bg-pink-500/10 text-pink-500 border-pink-500/20"
                                    : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                                }`}
                                title={
                                  declaration.shownInFilter === true
                                    ? t(
                                        "admin.declarationManagement.showInFilter"
                                      ) || "Visible in Filter"
                                    : t(
                                        "admin.declarationManagement.hiddenInFilter"
                                      ) || "Hidden in Filter"
                                }
                              >
                                {declaration.shownInFilter === true ? (
                                  <Icon path={mdiEye} size={0.50} />
                                ) : (
                                  <Icon path={mdiEyeOff} size={0.50} />
                                )}
                              </span>
                              {declaration.type && (
                                <span className="text-xs text-pink-500 font-medium flex-shrink-0">
                                  {declaration.type}
                                </span>
                              )}
                            </div>
                            {declaration.description && (
                              <p
                                className="text-xs text-muted-foreground line-clamp-2 mb-2"
                                title={declaration.description}
                              >
                                {truncateText(declaration.description, 25)}
                              </p>
                            )}
                            {declaration._count && (
                              <p className="text-xs text-muted-foreground">
                                {t("admin.declarationManagement.usedInMeals", {
                                  count: declaration._count.mealDeclarations,
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                        {canManageDeclarationActions && (
                          <DropdownMenu
                            open={openDeclarationMobileMenuId === declaration.id}
                            onOpenChange={(open) => {
                              setOpenDeclarationMobileMenuId(
                                open ? declaration.id : null
                              );
                              if (open) setOpenDeclarationDesktopMenuId(null);
                            }}
                          >
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 flex-shrink-0 touch-manipulation relative z-10 pointer-events-auto"
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                }}
                                onClick={() => {
                                  setOpenDeclarationMobileMenuId((prev) =>
                                    prev === declaration.id ? null : declaration.id
                                  );
                                  setOpenDeclarationDesktopMenuId(null);
                                }}
                              >
                                <Icon path={mdiDotsVertical} size={0.67} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canUpdateDeclaration && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setOpenDeclarationMobileMenuId(null);
                                    handleEdit(declaration);
                                  }}
                                >
                                  <Icon path={mdiPencil} size={0.67} className="mr-2" />
                                  {t("admin.declarationManagement.edit")}
                                </DropdownMenuItem>
                              )}
                              {isSuperAdmin && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setOpenDeclarationMobileMenuId(null);
                                    openMoveDeclaration(declaration);
                                  }}
                                >
                                  <Icon path={mdiTag} size={0.67} className="mr-2" />
                                  {t("admin.declarationManagement.moveOrganization", { defaultValue: "Move to organization" })}
                                </DropdownMenuItem>
                              )}
                              {canDeleteDeclaration && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setOpenDeclarationMobileMenuId(null);
                                    handleDeleteClick(declaration);
                                  }}
                                  className="text-destructive"
                                >
                                  <Icon path={mdiDelete} size={0.67} className="mr-2" />
                                  {t("admin.declarationManagement.delete")}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <Card className="hidden md:block">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {isSuperAdmin && (
                            <TableHead className="w-10">
                              <Checkbox
                                checked={
                                  declarations.length > 0 &&
                                  declarations.every((d) =>
                                    selectedDeclarationIds.has(d.id)
                                  )
                                }
                                onCheckedChange={(checked) =>
                                  setAllSelectedDeclarationsOnPage(
                                    Boolean(checked)
                                  )
                                }
                              />
                            </TableHead>
                          )}
                          <TableHead className="w-16"></TableHead>
                          <TableHead>
                            {t("admin.declarationManagement.declarationName")}
                          </TableHead>
                          <TableHead>
                            {t("admin.declarationManagement.declarationType")}
                          </TableHead>
                          <TableHead>
                            {t("admin.declarationManagement.descriptionLabel")}
                          </TableHead>
                          <TableHead className="text-center">
                            {t("admin.declarationManagement.meals")}
                          </TableHead>
                          <TableHead className="text-right w-24"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {declarations.map((declaration) => (
                          <TableRow key={declaration.id}>
                            {isSuperAdmin && (
                              <TableCell>
                                <Checkbox
                                  checked={selectedDeclarationIds.has(declaration.id)}
                                  onCheckedChange={(checked) =>
                                    toggleSelectedDeclaration(
                                      declaration.id,
                                      Boolean(checked)
                                    )
                                  }
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              {declaration.icon && (
                                <span className="text-2xl">
                                  {declaration.icon}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span>{declaration.name}</span>
                                <span
                                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full border ${
                                    declaration.shownInFilter === true
                                      ? "bg-pink-500/10 text-pink-500 border-pink-500/20"
                                      : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                                  }`}
                                  title={
                                    declaration.shownInFilter === true
                                      ? t(
                                          "admin.declarationManagement.showInFilter"
                                        ) || "Visible in Filter"
                                      : t(
                                          "admin.declarationManagement.hiddenInFilter"
                                        ) || "Hidden in Filter"
                                  }
                                >
                                  {declaration.shownInFilter === true ? (
                                    <Icon path={mdiEye} size={0.50} />
                                  ) : (
                                    <Icon path={mdiEyeOff} size={0.50} />
                                  )}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {declaration.type && (
                                <span className="text-xs text-pink-500 font-medium">
                                  {declaration.type}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-md">
                              {declaration.description && (
                                <p
                                  className="text-sm text-muted-foreground truncate"
                                  title={declaration.description}
                                >
                                  {truncateText(declaration.description, 25)}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {declaration._count && (
                                <span className="text-sm">
                                  {declaration._count.mealDeclarations}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {canManageDeclarationActions && (
                                <DropdownMenu
                                  open={openDeclarationDesktopMenuId === declaration.id}
                                  onOpenChange={(open) => {
                                    setOpenDeclarationDesktopMenuId(
                                      open ? declaration.id : null
                                    );
                                    if (open) setOpenDeclarationMobileMenuId(null);
                                  }}
                                >
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 touch-manipulation relative z-10 pointer-events-auto"
                                      onPointerDown={(e) => {
                                        e.preventDefault();
                                      }}
                                      onClick={() => {
                                        setOpenDeclarationDesktopMenuId((prev) =>
                                          prev === declaration.id ? null : declaration.id
                                        );
                                        setOpenDeclarationMobileMenuId(null);
                                      }}
                                    >
                                      <Icon path={mdiDotsVertical} size={0.67} />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {canUpdateDeclaration && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setOpenDeclarationDesktopMenuId(null);
                                          handleEdit(declaration);
                                        }}
                                      >
                                        <Icon path={mdiPencil} size={0.67} className="mr-2" />
                                        {t("admin.declarationManagement.edit")}
                                      </DropdownMenuItem>
                                    )}
                                    {isSuperAdmin && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setOpenDeclarationDesktopMenuId(null);
                                          openMoveDeclaration(declaration);
                                        }}
                                      >
                                        <Icon path={mdiTag} size={0.67} className="mr-2" />
                                        {t("admin.declarationManagement.moveOrganization", { defaultValue: "Move to organization" })}
                                      </DropdownMenuItem>
                                    )}
                                    {canDeleteDeclaration && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setOpenDeclarationDesktopMenuId(null);
                                          handleDeleteClick(declaration);
                                        }}
                                        className="text-destructive"
                                      >
                                        <Icon path={mdiDelete} size={0.67} className="mr-2" />
                                        {t(
                                          "admin.declarationManagement.delete"
                                        )}
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {t("admin.declarationManagement.showingDeclarations", {
                      count: declarations.length,
                      total: totalCount,
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                    >
                      <Icon path={mdiChevronLeft} size={0.67} />
                    </Button>
                    <span className="text-sm">
                      {t("admin.declarationManagement.pageOf", {
                        current: currentPage,
                        total: totalPages,
                      })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      <Icon path={mdiChevronRight} size={0.67} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-card text-foreground border-border">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.declarationManagement.createNewDeclaration")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                {t("admin.declarationManagement.declarationName")}{" "}
                <span className="text-red-500">
                  {t("admin.declarationManagement.required")}
                </span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t(
                  "admin.declarationManagement.declarationNamePlaceholder"
                )}
                required
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type" className="text-sm font-medium">
                {t("admin.declarationManagement.declarationType")}
              </Label>
              <Input
                id="type"
                value={formData.type || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value || null,
                  })
                }
                placeholder={t(
                  "admin.declarationManagement.declarationTypePlaceholder"
                )}
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                {t("admin.declarationManagement.descriptionLabel")}
              </Label>
              <Textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t(
                  "admin.declarationManagement.descriptionPlaceholder"
                )}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="icon" className="text-sm font-medium">
                {t("admin.declarationManagement.iconLabel")}
              </Label>
              <Input
                id="icon"
                value={formData.icon || ""}
                onChange={(e) =>
                  setFormData({ ...formData, icon: e.target.value })
                }
                placeholder={t("admin.declarationManagement.iconPlaceholder")}
                maxLength={10}
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="flex items-center justify-between space-y-0 rounded-md border border-border p-4">
              <div className="space-y-0.5 flex-1 pr-4">
                <Label htmlFor="shownInFilter" className="text-sm font-medium">
                  {t("admin.declarationManagement.showInFilter")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("admin.declarationManagement.showInFilterDescription")}
                </p>
              </div>
              <Switch
                id="shownInFilter"
                checked={formData.shownInFilter !== false}
                onCheckedChange={(checked: boolean) =>
                  setFormData({ ...formData, shownInFilter: checked })
                }
              />
            </div>

            {/* Excluded Branches Section */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                {t("admin.declarationManagement.excludedBranches")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.declarationManagement.excludedBranchesDescription")}
              </p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 space-y-2">
                {branches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t("admin.declarationManagement.noBranchesAvailable")}
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
                    {t("admin.declarationManagement.excludedBranches")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.declarationManagement.branchesExcluded", {
                      count: formData.excludedBranches?.length || 0,
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button
                type="button"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  resetForm();
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t("admin.declarationManagement.cancel")}
              </Button>
              {canCreateDeclaration && (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                      {t("admin.declarationManagement.creating")}
                    </>
                  ) : (
                    t("admin.declarationManagement.create")
                  )}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-card text-foreground border-border">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.declarationManagement.editDeclaration")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-sm font-medium">
                {t("admin.declarationManagement.declarationName")}{" "}
                <span className="text-red-500">
                  {t("admin.declarationManagement.required")}
                </span>
              </Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t(
                  "admin.declarationManagement.declarationNamePlaceholder"
                )}
                required
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-type" className="text-sm font-medium">
                {t("admin.declarationManagement.declarationType")}
              </Label>
              <Input
                id="edit-type"
                value={formData.type || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value || null,
                  })
                }
                placeholder={t(
                  "admin.declarationManagement.declarationTypePlaceholder"
                )}
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description" className="text-sm font-medium">
                {t("admin.declarationManagement.descriptionLabel")}
              </Label>
              <Textarea
                id="edit-description"
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t(
                  "admin.declarationManagement.descriptionPlaceholder"
                )}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-icon" className="text-sm font-medium">
                {t("admin.declarationManagement.iconLabel")}
              </Label>
              <Input
                id="edit-icon"
                value={formData.icon || ""}
                onChange={(e) =>
                  setFormData({ ...formData, icon: e.target.value })
                }
                placeholder={t("admin.declarationManagement.iconPlaceholder")}
                maxLength={10}
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="flex items-center justify-between space-y-0 rounded-md border border-border p-4">
              <div className="space-y-0.5 flex-1 pr-4">
                <Label
                  htmlFor="edit-shownInFilter"
                  className="text-sm font-medium"
                >
                  {t("admin.declarationManagement.showInFilter")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("admin.declarationManagement.showInFilterDescription")}
                </p>
              </div>
              <Switch
                id="edit-shownInFilter"
                checked={formData.shownInFilter !== false}
                onCheckedChange={(checked: boolean) =>
                  setFormData({ ...formData, shownInFilter: checked })
                }
              />
            </div>

            {/* Excluded Branches Section */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                {t("admin.declarationManagement.excludedBranches")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.declarationManagement.excludedBranchesDescription")}
              </p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 space-y-2">
                {branches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t("admin.declarationManagement.noBranchesAvailable")}
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
                    {t("admin.declarationManagement.excludedBranches")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.declarationManagement.branchesExcluded", {
                      count: formData.excludedBranches?.length || 0,
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button
                type="button"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  resetForm();
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t("admin.declarationManagement.cancel")}
              </Button>
              {canUpdateDeclaration && (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                      {t("admin.declarationManagement.updating")}
                    </>
                  ) : (
                    t("admin.declarationManagement.update")
                  )}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Declaration Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.declarationManagement.deleteDeclaration")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              {t(
                "admin.declarationManagement.deleteDeclarationDescription",
                { name: declarationToDelete?.name || "" }
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setDeclarationToDelete(null);
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t(
                  "admin.declarationManagement.deleteDeclarationCancel"
                )}
              </Button>
              {canDeleteDeclaration && (
                <Button
                  onClick={handleDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {t(
                    "admin.declarationManagement.deleteDeclarationConfirm"
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to Organization Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.declarationManagement.moveOrganization", { defaultValue: "Move to organization" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{declarationToMove?.name}</p>
            <div className="space-y-2">
              <Label>
                {t("admin.declarationManagement.targetOrganization", { defaultValue: "Target organization" })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={targetOrganizationId}
                onValueChange={setTargetOrganizationId}
                placeholder={t("admin.declarationManagement.selectOrganization", {
                  defaultValue: "Select organization",
                })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setMoveDialogOpen(false);
                  setDeclarationToMove(null);
                }}
                disabled={moving}
                className="bg-transparent hover:bg-muted text-foreground border border-border h-10"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleMoveDeclaration}
                disabled={moving}
                className="bg-pink-500 hover:bg-pink-600 text-white h-10"
              >
                {moving ? t("common.loading") : t("common.save", { defaultValue: "Save" })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkMoveDialogOpen} onOpenChange={setBulkMoveDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.declarationManagement.moveSelected", {
                defaultValue: "Move selected",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("admin.declarationManagement.selectedCount", {
                defaultValue: "Selected: {{count}}",
                count: selectedDeclarationIds.size,
              })}
            </p>
            <div className="space-y-2">
              <Label>
                {t("admin.declarationManagement.targetOrganization", {
                  defaultValue: "Target organization",
                })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={bulkTargetOrganizationId}
                onValueChange={setBulkTargetOrganizationId}
                placeholder={t("admin.declarationManagement.selectOrganization", {
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
                onClick={handleBulkMoveDeclarations}
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

      <Dialog open={bulkCopyDialogOpen} onOpenChange={setBulkCopyDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.declarationManagement.copySelected", {
                defaultValue: "Copy selected",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("admin.declarationManagement.selectedCount", {
                defaultValue: "Selected: {{count}}",
                count: selectedDeclarationIds.size,
              })}
            </p>
            <div className="space-y-2">
              <Label>
                {t("admin.declarationManagement.targetOrganization", {
                  defaultValue: "Target organization",
                })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={bulkCopyTargetOrganizationId}
                onValueChange={setBulkCopyTargetOrganizationId}
                placeholder={t("admin.declarationManagement.selectOrganization", {
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
                onClick={handleBulkCopyDeclarations}
                disabled={bulkCopying}
                className="bg-pink-500 hover:bg-pink-600 text-white h-10"
              >
                {bulkCopying
                  ? t("common.loading")
                  : t("common.save", { defaultValue: "Save" })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeclarationManagement;
