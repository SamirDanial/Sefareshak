import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import Icon from "@mdi/react";
import { mdiPlus, mdiPencil, mdiDelete, mdiLoading, mdiCalendar, mdiSort } from "@mdi/js";
import branchService, { type Branch, type Organization } from "@/services/branchService";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import OrganizationSearchSelect from "@/components/OrganizationSearchSelect";
import { Label } from "@/components/ui/label";

const BranchManagement: React.FC = () => {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { canAny, isSuperAdmin } = usePermissions();

  const reservationSettingsTooltip = (() => {
    const key = "admin.branchManagement.reservationSettingsButton";
    const val = t(key);
    return val === key ? "Reservation Settings" : val;
  })();

  const canViewBranches = canAny([{ resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW }]);
  const canCreateBranch = canAny([{ resource: RESOURCES.BRANCHES, action: ACTIONS.CREATE }]);
  const canViewBranchSettings = canAny([
    { resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW_BRANCH_SETTINGS },
  ]);
  const canViewBranchReservationSettings = canAny([
    { resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW_BRANCH_RESERVATION_SETTINGS },
  ]);
  const canDeleteBranch = canAny([{ resource: RESOURCES.BRANCHES, action: ACTIONS.DELETE }]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [branchToMove, setBranchToMove] = useState<Branch | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [targetOrganizationId, setTargetOrganizationId] = useState<string>("");
  const [moving, setMoving] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "createdAt">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const loadBranches = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const data = await branchService.getBranches(token || undefined);
      setBranches(data || []);
    } catch (error) {
      console.error("Failed to load branches", error);
      toast.error(t("admin.branchManagement.loadError"));
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const openCreate = () => {
    navigate("/admin/branches/new");
  };

  const openMoveBranch = async (branch: Branch) => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setBranchToMove(branch);
      setTargetOrganizationId(branch.organizationId || "");
      setMoveDialogOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load organizations");
    }
  };

  const handleMoveBranch = async () => {
    if (!branchToMove) return;
    if (!targetOrganizationId) {
      toast.error(t("admin.branchManagement.selectOrganization", { defaultValue: "Select an organization" }));
      return;
    }

    setMoving(true);
    try {
      const token = await getToken();
      if (!token) return;
      await branchService.setBranchOrganization(branchToMove.id, targetOrganizationId, token);
      toast.success(t("admin.branchManagement.moved", { defaultValue: "Branch moved" }));
      setMoveDialogOpen(false);
      setBranchToMove(null);
      await loadBranches();
    } catch (e: any) {
      toast.error(e?.message || "Failed to move branch");
    } finally {
      setMoving(false);
    }
  };

  const openEdit = (branch: Branch) => {
    navigate(`/admin/branches/${branch.id}/edit`);
  };

  const openReservationSettings = (branch: Branch) => {
    navigate(`/admin/branches/${branch.id}/reservation-settings`);
  };

  const handleDeleteClick = (branch: Branch) => {
    setBranchToDelete(branch);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!branchToDelete) return;
    setDeletingId(branchToDelete.id);
    try {
      const token = await getToken();
      await branchService.deleteBranch(branchToDelete.id, token || undefined);
      toast.success(t("admin.branchManagement.deleteSuccess"));
      loadBranches();
      setDeleteDialogOpen(false);
      setBranchToDelete(null);
    } catch (error) {
      console.error("Failed to delete branch", error);
      toast.error(t("admin.branchManagement.deleteError"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSort = (field: "name" | "createdAt") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
  };

  const sortedBranches = useMemo(() => {
    const sorted = [...branches];
    sorted.sort((a, b) => {
      if (sortBy === "name") {
        const nameA = a.name || "";
        const nameB = b.name || "";
        const comparison = nameA.localeCompare(nameB);
        return sortOrder === "asc" ? comparison : -comparison;
      }
      return 0;
    });
    return sorted;
  }, [branches, sortBy, sortOrder]);

  const orgMaxActiveBranches = useMemo(() => {
    const first = branches.find((b) => (b as any)?.organization?.maxActiveBranches !== undefined);
    const raw = (first as any)?.organization?.maxActiveBranches;
    return raw !== null && raw !== undefined ? Number(raw) : null;
  }, [branches]);

  const activeBranchCount = useMemo(() => branches.filter((b) => b.isActive !== false).length, [branches]);

  const branchLimitReached =
    orgMaxActiveBranches !== null && Number.isFinite(orgMaxActiveBranches)
      ? activeBranchCount >= orgMaxActiveBranches
      : false;

  const branchIdsAllowedByLimit = useMemo(() => {
    if (orgMaxActiveBranches === null || !Number.isFinite(orgMaxActiveBranches)) return new Set<string>();
    const limit = Math.max(0, Math.floor(orgMaxActiveBranches));
    const byCreated = [...branches].sort((a: any, b: any) => {
      const da = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return da - db;
    });
    return new Set<string>(byCreated.slice(0, limit).map((b) => String(b.id)));
  }, [branches, orgMaxActiveBranches]);

  const orgReservationsAllowed = useMemo(() => {
    const first = branches.find((b) => (b as any)?.organization?.reservationsAllowed !== undefined);
    const raw = (first as any)?.organization?.reservationsAllowed;
    return raw !== false;
  }, [branches]);

  const tableRows = useMemo(
    () =>
      sortedBranches.map((branch) => (
        <TableRow key={branch.id}>
          <TableCell className="font-medium">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span>{branch.name}</span>
                {branch.isActive === false && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                    {t("admin.branchManagement.inactive", { defaultValue: "Inactive" })}
                  </span>
                )}
              </div>
              {branch.isActive === false &&
                orgMaxActiveBranches !== null &&
                Number.isFinite(orgMaxActiveBranches) &&
                branchIdsAllowedByLimit.size > 0 &&
                !branchIdsAllowedByLimit.has(String(branch.id)) && (
                  <div className="text-xs text-muted-foreground">
                    {t("admin.branchManagement.deactivatedByBranchLimit", {
                      defaultValue:
                        "Deactivated due to organization branch limit (max {{limit}} active branches)",
                    }).replace("{{limit}}", String(orgMaxActiveBranches))}
                  </div>
                )}
            </div>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              {orgReservationsAllowed && canViewBranchReservationSettings && (
                <Button
                  size="icon"
                  onClick={() => openReservationSettings(branch)}
                  title={reservationSettingsTooltip}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  <Icon path={mdiCalendar} size={0.67} />
                </Button>
              )}
              {canViewBranchSettings && (
                <Button
                  size="icon"
                  onClick={() => openEdit(branch)}
                  title={t("admin.branchManagement.editBranch")}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  <Icon path={mdiPencil} size={0.67} />
                </Button>
              )}
              {isSuperAdmin && (
                <Button
                  size="sm"
                  onClick={() => openMoveBranch(branch)}
                  title={t("admin.branchManagement.moveOrganization", { defaultValue: "Move to organization" })}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  {t("admin.branchManagement.moveOrganization", { defaultValue: "Move" })}
                </Button>
              )}
              {canDeleteBranch && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => handleDeleteClick(branch)}
                  disabled={deletingId === branch.id}
                  title={t("admin.branchManagement.deleteBranch")}
                >
                  {deletingId === branch.id ? (
                    <Icon path={mdiLoading} size={0.67} className="animate-spin" />
                  ) : (
                    <Icon path={mdiDelete} size={0.67} />
                  )}
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
      )),
    [
      sortedBranches,
      deletingId,
      t,
      canViewBranchReservationSettings,
      canViewBranchSettings,
      canDeleteBranch,
      orgMaxActiveBranches,
      branchIdsAllowedByLimit,
    ]
  );

  return (
    <div className="space-y-4 pb-4">
      {!canViewBranches ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Access denied</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-pink-500">
                {t("admin.branchManagement.title")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("admin.branchManagement.description")}
              </p>
            </div>
            {canCreateBranch && (
              <div className="flex flex-col items-end gap-1 text-right">
                <Button
                  onClick={openCreate}
                  disabled={branchLimitReached}
                  title={
                    branchLimitReached && orgMaxActiveBranches !== null
                      ? `Branch limit reached (maxActiveBranches=${orgMaxActiveBranches})`
                      : undefined
                  }
                  className="bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-60"
                >
                  <Icon path={mdiPlus} size={0.67} className="mr-2" />
                  {t("admin.branchManagement.addBranch")}
                </Button>
                {branchLimitReached && orgMaxActiveBranches !== null && (
                  <div className="text-xs text-muted-foreground max-w-[220px]">
                    {t("admin.branchManagement.branchLimitReachedHint", {
                      defaultValue: "Limit reached (max {{limit}}).",
                    }).replace("{{limit}}", String(orgMaxActiveBranches))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.branchManagement.branches") || t("admin.branchManagement.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">{t("admin.branchManagement.sortBy") || "Sort by"}:</span>
                <Button
                  size="sm"
                  onClick={() => handleSort("name")}
                  className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  {t("admin.branchManagement.nameAZ") || "Name"}
                  {sortBy === "name" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSort("createdAt")}
                  className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  {sortBy === "createdAt"
                    ? sortOrder === "desc"
                      ? t("admin.branchManagement.newestFirst") || "Newest"
                      : t("admin.branchManagement.oldestFirst") || "Oldest"
                    : t("admin.branchManagement.newestFirst") || "Newest"}
                  {sortBy === "createdAt" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon path={mdiLoading} size={0.67} className="animate-spin" />
                  <span>{t("admin.branchManagement.loadingBranches")}</span>
                </div>
              ) : branches.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/80 bg-muted/30 p-6 text-sm text-muted-foreground">
                  {t("admin.branchManagement.noBranches")}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.branchManagement.name")}</TableHead>
                      <TableHead className="text-right">{t("admin.branchManagement.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{tableRows}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Delete Branch Dialog */}
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogContent className="max-w-2xl bg-card border-border text-foreground">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold text-white">
                  {t("admin.branchManagement.deleteBranch")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-muted-foreground">{t("admin.branchManagement.deleteConfirm")}</p>
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => {
                      setDeleteDialogOpen(false);
                      setBranchToDelete(null);
                    }}
                    disabled={deletingId !== null}
                    className="bg-transparent hover:bg-muted text-foreground border border-border h-10"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={handleDelete}
                    disabled={deletingId !== null}
                    className="bg-destructive text-white hover:bg-destructive/90 h-10"
                  >
                    {deletingId !== null ? (
                      <>
                        <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />
                        {t("common.loading")}
                      </>
                    ) : (
                      t("common.delete")
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
            <DialogContent className="max-w-lg bg-card border-border text-foreground">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold text-white">
                  {t("admin.branchManagement.moveOrganization", { defaultValue: "Move to organization" })}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{branchToMove?.name}</p>
                <div className="space-y-2">
                  <Label>
                    {t("admin.branchManagement.targetOrganization", {
                      defaultValue: "Target organization",
                    })}
                  </Label>
                  <OrganizationSearchSelect
                    organizations={organizations || []}
                    value={targetOrganizationId}
                    onValueChange={setTargetOrganizationId}
                    placeholder={t("admin.branchManagement.selectOrganization", {
                      defaultValue: "Select organization",
                    })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => {
                      setMoveDialogOpen(false);
                      setBranchToMove(null);
                    }}
                    disabled={moving}
                    className="bg-transparent hover:bg-muted text-foreground border border-border h-10"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={handleMoveBranch}
                    disabled={moving}
                    className="bg-pink-500 hover:bg-pink-600 text-white h-10"
                  >
                    {moving ? t("common.loading") : t("common.save", { defaultValue: "Save" })}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};

export default BranchManagement;

