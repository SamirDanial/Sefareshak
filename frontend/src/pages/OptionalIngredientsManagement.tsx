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
import { Checkbox } from "@/components/ui/checkbox";
import OrganizationSearchSelect from "@/components/OrganizationSearchSelect";
import Icon from "@mdi/react";
import { mdiSilverwareForkKnife, mdiPlus, mdiMagnify, mdiDotsVertical, mdiPencil, mdiDelete, mdiChevronLeft, mdiChevronRight, mdiRefresh, mdiSort } from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import {
  optionalIngredientService,
  type OptionalIngredient,
  type OptionalIngredientFormData,
} from "@/services/optionalIngredientService";
import branchService, { type Organization } from "@/services/branchService";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";

const OptionalIngredientsManagement: React.FC = () => {
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const { canAny, isSuperAdmin } = usePermissions();

  const canCreateOptionalIngredient = canAny([
    { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.CREATE },
  ]);
  const canUpdateOptionalIngredient = canAny([
    { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.UPDATE },
  ]);
  const canDeleteOptionalIngredient = canAny([
    { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.DELETE },
  ]);
  const [optionalIngredients, setOptionalIngredients] = useState<
    OptionalIngredient[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [openOptionalIngredientMobileMenuId, setOpenOptionalIngredientMobileMenuId] =
    useState<string | null>(null);
  const [openOptionalIngredientDesktopMenuId, setOpenOptionalIngredientDesktopMenuId] =
    useState<string | null>(null);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [optionalIngredientToDelete, setOptionalIngredientToDelete] = useState<OptionalIngredient | null>(null);
  const [selectedOptionalIngredient, setSelectedOptionalIngredient] =
    useState<OptionalIngredient | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Move to organization states
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [optionalIngredientToMove, setOptionalIngredientToMove] = useState<OptionalIngredient | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [targetOrganizationId, setTargetOrganizationId] = useState<string>("");
  const [moving, setMoving] = useState(false);

  const [selectedOptionalIngredientIds, setSelectedOptionalIngredientIds] =
    useState<Set<string>>(new Set());
  const [bulkMoveDialogOpen, setBulkMoveDialogOpen] = useState(false);
  const [bulkTargetOrganizationId, setBulkTargetOrganizationId] =
    useState<string>("");
  const [bulkMoving, setBulkMoving] = useState(false);

  const [bulkCopyDialogOpen, setBulkCopyDialogOpen] = useState(false);
  const [bulkCopyTargetOrganizationId, setBulkCopyTargetOrganizationId] =
    useState<string>("");
  const [bulkCopying, setBulkCopying] = useState(false);

  const toggleSelectedOptionalIngredient = (id: string, checked: boolean) => {
    setSelectedOptionalIngredientIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const setAllSelectedOptionalIngredientsOnPage = (checked: boolean) => {
    setSelectedOptionalIngredientIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        optionalIngredients.forEach((oi) => next.add(oi.id));
      } else {
        optionalIngredients.forEach((oi) => next.delete(oi.id));
      }
      return next;
    });
  };

  // Form states
  const [formData, setFormData] = useState<OptionalIngredientFormData>({
    name: "",
    description: "",
  });

  // Fetch optional ingredients
  const fetchOptionalIngredients = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await optionalIngredientService.getOptionalIngredients(
        currentPage,
        10,
        searchTerm,
        sortBy,
        sortOrder,
        token || undefined
      );
      setOptionalIngredients(response.optionalIngredients);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error: any) {
      console.error("Error fetching optional ingredients:", error);
      toast.error(
        error?.response?.data?.message ||
          t("admin.optionalIngredientManagement.failedToFetch")
      );
    } finally {
      setLoading(false);
    }
  };

  const openBulkMoveOptionalIngredients = async () => {
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

  const openBulkCopyOptionalIngredients = async () => {
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

  const handleBulkMoveOptionalIngredients = async () => {
    const ids = Array.from(selectedOptionalIngredientIds);
    if (ids.length === 0) return;
    if (!bulkTargetOrganizationId) {
      toast.error(
        t("admin.optionalIngredientManagement.selectOrganization", {
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
          optionalIngredientService.setOptionalIngredientOrganization(
            id,
            bulkTargetOrganizationId,
            token || undefined
          )
        )
      );

      const failedCount = results.filter((r) => r.status === "rejected").length;
      if (failedCount > 0) {
        toast.error(
          t("admin.optionalIngredientManagement.bulkMoveFailed", {
            defaultValue: "Some optional ingredients failed to move",
          })
        );
      } else {
        toast.success(
          t("admin.optionalIngredientManagement.bulkMoved", {
            defaultValue: "Optional ingredients moved",
          })
        );
      }

      setBulkMoveDialogOpen(false);
      setSelectedOptionalIngredientIds(new Set());
      await fetchOptionalIngredients();
    } finally {
      setBulkMoving(false);
    }
  };

  const handleBulkCopyOptionalIngredients = async () => {
    const ids = Array.from(selectedOptionalIngredientIds);
    if (ids.length === 0) return;
    if (!bulkCopyTargetOrganizationId) {
      toast.error(
        t("admin.optionalIngredientManagement.selectOrganization", {
          defaultValue: "Select an organization",
        })
      );
      return;
    }

    setBulkCopying(true);
    try {
      const token = await getToken();
      if (!token) return;

      await optionalIngredientService.copyOptionalIngredientsToOrganization(
        ids,
        bulkCopyTargetOrganizationId,
        token || undefined
      );

      toast.success(
        t("admin.optionalIngredientManagement.bulkCopied", {
          defaultValue: "Optional ingredients copied",
        })
      );

      setBulkCopyDialogOpen(false);
      setSelectedOptionalIngredientIds(new Set());
      await fetchOptionalIngredients();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t("admin.optionalIngredientManagement.bulkCopyFailed", {
            defaultValue: "Some optional ingredients failed to copy",
          })
      );
    } finally {
      setBulkCopying(false);
    }
  };

  useEffect(() => {
    fetchOptionalIngredients();
  }, [currentPage, searchTerm, sortBy, sortOrder]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== undefined) {
        setCurrentPage(1);
        fetchOptionalIngredients();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Handle search
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Handle submit (create or update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const token = await getToken();

      if (selectedOptionalIngredient) {
        // Update
        await optionalIngredientService.updateOptionalIngredient(
          selectedOptionalIngredient.id,
          formData,
          token || undefined
        );
        toast.success(t("admin.optionalIngredientManagement.updatedSuccess"));
        setIsEditDialogOpen(false);
      } else {
        // Create
        await optionalIngredientService.createOptionalIngredient(
          formData,
          token || undefined
        );
        toast.success(t("admin.optionalIngredientManagement.createdSuccess"));
        setIsCreateDialogOpen(false);
      }

      resetForm();
      await fetchOptionalIngredients();
    } catch (error: any) {
      console.error("Error saving optional ingredient:", error);
      toast.error(
        error?.response?.data?.message ||
          t("admin.optionalIngredientManagement.failedToSave")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit
  const handleEdit = (optionalIngredient: OptionalIngredient) => {
    setSelectedOptionalIngredient(optionalIngredient);
    setFormData({
      name: optionalIngredient.name,
      description: optionalIngredient.description || "",
    });
    setIsEditDialogOpen(true);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!optionalIngredientToDelete) return;
    try {
      const token = await getToken();
      await optionalIngredientService.deleteOptionalIngredient(
        optionalIngredientToDelete.id,
        token || undefined
      );
      toast.success(t("admin.optionalIngredientManagement.deletedSuccess"));
      await fetchOptionalIngredients();
      setIsDeleteDialogOpen(false);
      setOptionalIngredientToDelete(null);
    } catch (error: any) {
      console.error("Error deleting optional ingredient:", error);
      toast.error(
        error?.response?.data?.message ||
          t("admin.optionalIngredientManagement.failedToDelete")
      );
    }
  };

  const handleDeleteClick = (optionalIngredient: OptionalIngredient) => {
    setOptionalIngredientToDelete(optionalIngredient);
    setIsDeleteDialogOpen(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
    });
    setSelectedOptionalIngredient(null);
  };

  // Handle create new
  const handleCreateNew = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  // Open move optional ingredient dialog
  const openMoveOptionalIngredient = async (optionalIngredient: OptionalIngredient) => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setOptionalIngredientToMove(optionalIngredient);
      setTargetOrganizationId(optionalIngredient.organizationId || "");
      setMoveDialogOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load organizations");
    }
  };

  // Handle move optional ingredient
  const handleMoveOptionalIngredient = async () => {
    if (!optionalIngredientToMove) return;
    if (!targetOrganizationId) {
      toast.error(t("admin.optionalIngredientManagement.selectOrganization", { defaultValue: "Select an organization" }));
      return;
    }

    setMoving(true);
    try {
      const token = await getToken();
      await optionalIngredientService.setOptionalIngredientOrganization(
        optionalIngredientToMove.id,
        targetOrganizationId,
        token || undefined
      );
      toast.success(t("admin.optionalIngredientManagement.moved", { defaultValue: "Optional ingredient moved" }));
      setMoveDialogOpen(false);
      setOptionalIngredientToMove(null);
      await fetchOptionalIngredients();
    } catch (e: any) {
      toast.error(e?.message || "Failed to move optional ingredient");
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.optionalIngredientManagement.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.optionalIngredientManagement.description")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canCreateOptionalIngredient && (
            <Button
              onClick={handleCreateNew}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              <Icon path={mdiPlus} size={0.67} className="mr-2" />
              {t("admin.optionalIngredientManagement.addOptionalIngredient")}
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
                    optionalIngredients.length > 0 &&
                    optionalIngredients.every((oi) =>
                      selectedOptionalIngredientIds.has(oi.id)
                    )
                  }
                  onCheckedChange={(checked) =>
                    setAllSelectedOptionalIngredientsOnPage(Boolean(checked))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {t("admin.optionalIngredientManagement.selectedCount", {
                    defaultValue: "Selected: {{count}}",
                    count: selectedOptionalIngredientIds.size,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setSelectedOptionalIngredientIds(new Set())}
                  disabled={selectedOptionalIngredientIds.size === 0}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  {t("admin.optionalIngredientManagement.clearSelection", {
                    defaultValue: "Clear",
                  })}
                </Button>
                <Button
                  type="button"
                  onClick={openBulkMoveOptionalIngredients}
                  disabled={selectedOptionalIngredientIds.size === 0}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {t("admin.optionalIngredientManagement.moveSelected", {
                    defaultValue: "Move selected",
                  })}
                </Button>
                <Button
                  type="button"
                  onClick={openBulkCopyOptionalIngredients}
                  disabled={selectedOptionalIngredientIds.size === 0}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  {t("admin.optionalIngredientManagement.copySelected", {
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
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t(
                    "admin.optionalIngredientManagement.searchPlaceholder"
                  )}
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleSearch(e.target.value)
                  }
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">{t("admin.optionalIngredientManagement.sortBy")}:</span>
              <Button
                size="sm"
                onClick={() => {
                  if (sortBy === "name") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("name");
                    setSortOrder("asc");
                  }
                }}
                className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
              >
                <span className={sortBy === "name" ? "text-white" : ""}>
                  {t("admin.optionalIngredientManagement.nameAZ")}
                </span>
                {sortBy === "name" && (
                  <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (sortBy === "createdAt") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("createdAt");
                    setSortOrder("desc");
                  }
                }}
                className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
              >
                <span className={sortBy === "createdAt" ? "text-white" : ""}>
                  {sortBy === "createdAt"
                    ? sortOrder === "desc"
                      ? t("admin.optionalIngredientManagement.newestFirst")
                      : t("admin.optionalIngredientManagement.oldestFirst")
                    : t("admin.optionalIngredientManagement.newestFirst")}
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
              {t("admin.optionalIngredientManagement.loadingTitle")}
            </h3>
          </div>
        </div>
      ) : (
        <>
          {/* Optional Ingredients List */}
          {optionalIngredients.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Icon path={mdiSilverwareForkKnife} size={2.00} className="mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {t(
                    "admin.optionalIngredientManagement.noOptionalIngredientsFound"
                  )}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchTerm
                    ? t(
                        "admin.optionalIngredientManagement.tryAdjustingFilters"
                      )
                    : t("admin.optionalIngredientManagement.getStarted")}
                </p>
                {!searchTerm && canCreateOptionalIngredient && (
                  <Button
                    onClick={handleCreateNew}
                    className="bg-pink-500 hover:bg-pink-600 text-white"
                  >
                    <Icon path={mdiPlus} size={0.67} className="mr-2" />
                    {t(
                      "admin.optionalIngredientManagement.addOptionalIngredient"
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block md:hidden space-y-3">
                {optionalIngredients.map((optionalIngredient) => (
                  <Card key={optionalIngredient.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {isSuperAdmin && (
                            <div className="pt-1">
                              <Checkbox
                                checked={selectedOptionalIngredientIds.has(
                                  optionalIngredient.id
                                )}
                                onCheckedChange={(checked) =>
                                  toggleSelectedOptionalIngredient(
                                    optionalIngredient.id,
                                    Boolean(checked)
                                  )
                                }
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm truncate mb-1">
                              {optionalIngredient.name}
                            </h3>
                            {optionalIngredient.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                {optionalIngredient.description}
                              </p>
                            )}
                            {optionalIngredient._count && (
                              <p className="text-xs text-muted-foreground">
                                {t(
                                  "admin.optionalIngredientManagement.usedInMeals",
                                  {
                                    count:
                                      optionalIngredient._count
                                        .mealOptionalIngredients,
                                  }
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        <DropdownMenu
                          open={openOptionalIngredientMobileMenuId === optionalIngredient.id}
                          onOpenChange={(open) => {
                            setOpenOptionalIngredientMobileMenuId(
                              open ? optionalIngredient.id : null
                            );
                            if (open) setOpenOptionalIngredientDesktopMenuId(null);
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
                                setOpenOptionalIngredientMobileMenuId((prev) =>
                                  prev === optionalIngredient.id
                                    ? null
                                    : optionalIngredient.id
                                );
                                setOpenOptionalIngredientDesktopMenuId(null);
                              }}
                            >
                              <Icon path={mdiDotsVertical} size={0.67} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenOptionalIngredientMobileMenuId(null);
                                handleEdit(optionalIngredient);
                              }}
                            >
                              <Icon path={mdiPencil} size={0.67} className="mr-2" />
                              {t("admin.optionalIngredientManagement.edit")}
                            </DropdownMenuItem>
                            {isSuperAdmin && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setOpenOptionalIngredientMobileMenuId(null);
                                  openMoveOptionalIngredient(optionalIngredient);
                                }}
                              >
                                <Icon path={mdiSilverwareForkKnife} size={0.67} className="mr-2" />
                                {t("admin.optionalIngredientManagement.moveOrganization", { defaultValue: "Move to organization" })}
                              </DropdownMenuItem>
                            )}
                            {canDeleteOptionalIngredient && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setOpenOptionalIngredientMobileMenuId(null);
                                  handleDeleteClick(optionalIngredient);
                                }}
                                className="text-destructive"
                              >
                                <Icon path={mdiDelete} size={0.67} className="mr-2" />
                                {t(
                                  "admin.optionalIngredientManagement.delete"
                                )}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                                  optionalIngredients.length > 0 &&
                                  optionalIngredients.every((i) =>
                                    selectedOptionalIngredientIds.has(i.id)
                                  )
                                }
                                onCheckedChange={(checked) =>
                                  setAllSelectedOptionalIngredientsOnPage(
                                    Boolean(checked)
                                  )
                                }
                              />
                            </TableHead>
                          )}
                          <TableHead>
                            {t(
                              "admin.optionalIngredientManagement.ingredientName"
                            )}
                          </TableHead>
                          <TableHead>
                            {t(
                              "admin.optionalIngredientManagement.descriptionLabel"
                            )}
                          </TableHead>
                          <TableHead className="text-center">
                            {t("admin.optionalIngredientManagement.meals")}
                          </TableHead>
                          <TableHead className="text-right w-24"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {optionalIngredients.map((optionalIngredient) => (
                          <TableRow key={optionalIngredient.id}>
                            {isSuperAdmin && (
                              <TableCell>
                                <Checkbox
                                  checked={selectedOptionalIngredientIds.has(
                                    optionalIngredient.id
                                  )}
                                  onCheckedChange={(checked) =>
                                    toggleSelectedOptionalIngredient(
                                      optionalIngredient.id,
                                      Boolean(checked)
                                    )
                                  }
                                />
                              </TableCell>
                            )}
                            <TableCell className="font-medium">
                              {optionalIngredient.name}
                            </TableCell>
                            <TableCell className="max-w-md">
                              {optionalIngredient.description && (
                                <p className="text-sm text-muted-foreground truncate">
                                  {optionalIngredient.description}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {optionalIngredient._count && (
                                <span className="text-sm">
                                  {
                                    optionalIngredient._count
                                      .mealOptionalIngredients
                                  }
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu
                                open={openOptionalIngredientDesktopMenuId === optionalIngredient.id}
                                onOpenChange={(open) => {
                                  setOpenOptionalIngredientDesktopMenuId(
                                    open ? optionalIngredient.id : null
                                  );
                                  if (open) setOpenOptionalIngredientMobileMenuId(null);
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
                                      setOpenOptionalIngredientDesktopMenuId((prev) =>
                                        prev === optionalIngredient.id
                                          ? null
                                          : optionalIngredient.id
                                      );
                                      setOpenOptionalIngredientMobileMenuId(null);
                                    }}
                                  >
                                    <Icon path={mdiDotsVertical} size={0.67} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setOpenOptionalIngredientDesktopMenuId(null);
                                      handleEdit(optionalIngredient);
                                    }}
                                  >
                                    <Icon path={mdiPencil} size={0.67} className="mr-2" />
                                    {t(
                                      "admin.optionalIngredientManagement.edit"
                                    )}
                                  </DropdownMenuItem>
                                  {isSuperAdmin && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setOpenOptionalIngredientDesktopMenuId(null);
                                        openMoveOptionalIngredient(optionalIngredient);
                                      }}
                                    >
                                      <Icon path={mdiSilverwareForkKnife} size={0.67} className="mr-2" />
                                      {t("admin.optionalIngredientManagement.moveOrganization", { defaultValue: "Move to organization" })}
                                    </DropdownMenuItem>
                                  )}
                                  {canDeleteOptionalIngredient && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setOpenOptionalIngredientDesktopMenuId(null);
                                        handleDeleteClick(optionalIngredient);
                                      }}
                                      className="text-destructive"
                                    >
                                      <Icon path={mdiDelete} size={0.67} className="mr-2" />
                                      {t(
                                        "admin.optionalIngredientManagement.delete"
                                      )}
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                    Showing {optionalIngredients.length} out of {totalCount}
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
                      {t("admin.optionalIngredientManagement.pageOf", {
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
              {t(
                "admin.optionalIngredientManagement.createNewOptionalIngredient"
              )}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                {t("admin.optionalIngredientManagement.ingredientName")}{" "}
                <span className="text-red-500">
                  {t("admin.optionalIngredientManagement.required")}
                </span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t(
                  "admin.optionalIngredientManagement.ingredientNamePlaceholder"
                )}
                required
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                {t("admin.optionalIngredientManagement.descriptionLabel")}
              </Label>
              <Textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t(
                  "admin.optionalIngredientManagement.descriptionPlaceholder"
                )}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
              />
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
                {t("admin.optionalIngredientManagement.cancel")}
              </Button>
              {canCreateOptionalIngredient && (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                      {t("admin.optionalIngredientManagement.creating")}
                    </>
                  ) : (
                    t("admin.optionalIngredientManagement.create")
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
              {t("admin.optionalIngredientManagement.editOptionalIngredient")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-sm font-medium">
                {t("admin.optionalIngredientManagement.ingredientName")}{" "}
                <span className="text-red-500">
                  {t("admin.optionalIngredientManagement.required")}
                </span>
              </Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t(
                  "admin.optionalIngredientManagement.ingredientNamePlaceholder"
                )}
                required
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description" className="text-sm font-medium">
                {t("admin.optionalIngredientManagement.descriptionLabel")}
              </Label>
              <Textarea
                id="edit-description"
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t(
                  "admin.optionalIngredientManagement.descriptionPlaceholder"
                )}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
              />
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
                {t("admin.optionalIngredientManagement.cancel")}
              </Button>
              {canUpdateOptionalIngredient && (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                      {t("admin.optionalIngredientManagement.updating")}
                    </>
                  ) : (
                    t("admin.optionalIngredientManagement.update")
                  )}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Optional Ingredient Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.optionalIngredientManagement.deleteOptionalIngredient")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              {t(
                "admin.optionalIngredientManagement.deleteOptionalIngredientDescription",
                { name: optionalIngredientToDelete?.name || "" }
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setOptionalIngredientToDelete(null);
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t(
                  "admin.optionalIngredientManagement.deleteOptionalIngredientCancel"
                )}
              </Button>
              {canDeleteOptionalIngredient && (
                <Button
                  onClick={handleDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {t(
                    "admin.optionalIngredientManagement.deleteOptionalIngredientConfirm"
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
              {t("admin.optionalIngredientManagement.moveOrganization", { defaultValue: "Move to organization" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{optionalIngredientToMove?.name}</p>
            <div className="space-y-2">
              <Label>
                {t("admin.optionalIngredientManagement.targetOrganization", { defaultValue: "Target organization" })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={targetOrganizationId}
                onValueChange={setTargetOrganizationId}
                placeholder={t("admin.optionalIngredientManagement.selectOrganization", {
                  defaultValue: "Select organization",
                })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setMoveDialogOpen(false);
                  setOptionalIngredientToMove(null);
                }}
                disabled={moving}
                className="bg-transparent hover:bg-muted text-foreground border border-border h-10"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleMoveOptionalIngredient}
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
              {t("admin.optionalIngredientManagement.moveSelected", {
                defaultValue: "Move selected",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("admin.optionalIngredientManagement.selectedCount", {
                defaultValue: "Selected: {{count}}",
                count: selectedOptionalIngredientIds.size,
              })}
            </p>
            <div className="space-y-2">
              <Label>
                {t("admin.optionalIngredientManagement.targetOrganization", {
                  defaultValue: "Target organization",
                })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={bulkTargetOrganizationId}
                onValueChange={setBulkTargetOrganizationId}
                placeholder={t(
                  "admin.optionalIngredientManagement.selectOrganization",
                  {
                    defaultValue: "Select organization",
                  }
                )}
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
                onClick={handleBulkMoveOptionalIngredients}
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
              {t("admin.optionalIngredientManagement.copySelected", {
                defaultValue: "Copy selected",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("admin.optionalIngredientManagement.selectedCount", {
                defaultValue: "Selected: {{count}}",
                count: selectedOptionalIngredientIds.size,
              })}
            </p>
            <div className="space-y-2">
              <Label>
                {t("admin.optionalIngredientManagement.targetOrganization", {
                  defaultValue: "Target organization",
                })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={bulkCopyTargetOrganizationId}
                onValueChange={setBulkCopyTargetOrganizationId}
                placeholder={t("admin.optionalIngredientManagement.selectOrganization", {
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
                onClick={handleBulkCopyOptionalIngredients}
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

export default OptionalIngredientsManagement;
