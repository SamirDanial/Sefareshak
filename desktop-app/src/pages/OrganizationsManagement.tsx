import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import {
  mdiDotsVertical,
  mdiEye,
  mdiEyeOff,
  mdiAlertCircle,
  mdiCheckCircle,
  mdiClock,
  mdiPause,
  mdiPencil,
  mdiPlus,
  mdiRefresh,
} from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import branchService, { type Organization } from "@/services/branchService";
import PageHeader from "@/components/PageHeader";
import { toast } from "@/components/Toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Switch from "@/components/Switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import ValidationDialog from "@/components/admin/ValidationDialog";
import UnvalidateValidationDialog from "@/components/admin/UnvalidateValidationDialog";

const OrganizationsManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);

  const [name, setName] = useState("");
  const [maxActiveBranches, setMaxActiveBranches] = useState<string>("");
  const [reservationsAllowed, setReservationsAllowed] = useState<boolean>(true);
  const [onlinePaymentsAllowed, setOnlinePaymentsAllowed] = useState<boolean>(true);
  const [cardPaymentsAllowed, setCardPaymentsAllowed] = useState<boolean>(true);
  const [paypalAllowed, setPaypalAllowed] = useState<boolean>(true);
  const [freeVersion, setFreeVersion] = useState<boolean>(false);

  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "validated" | "unvalidated" | "expired" | "grace_period" | "inactive"
  >(isSuperAdmin ? "validated" : "all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [selectedOrgForValidation, setSelectedOrgForValidation] = useState<Organization | null>(null);
  const [validationMode, setValidationMode] = useState<"create" | "edit">("create");
  const [existingValidation, setExistingValidation] = useState<any>(null);

  const [unvalidateDialogOpen, setUnvalidateDialogOpen] = useState(false);
  const [selectedOrgForUnvalidate, setSelectedOrgForUnvalidate] = useState<Organization | null>(null);
  const [selectedValidationIdForUnvalidate, setSelectedValidationIdForUnvalidate] = useState<string | null>(null);

  const pageSize = 10;

  const refreshOrganizations = useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    setLoading(true);
    try {
      if (isSuperAdmin) {
        try {
          const options: any = {
            page: currentPage,
            limit: pageSize,
          };
          if (searchTerm.trim()) options.search = searchTerm.trim();
          if (statusFilter !== "all") options.status = statusFilter;

          const response = await branchService.getOrganizationsWithValidation(token, options);
          const data = Array.isArray(response?.data) ? response.data : [];
          setOrganizations(data);
          setTotal(response?.pagination?.total ?? data.length);
          setTotalPages(response?.pagination?.totalPages ?? 1);
          return;
        } catch (e: any) {
          // Fallback to regular list if validation API fails
          const orgs = await branchService.getOrganizations(token);
          const list = Array.isArray(orgs) ? orgs : [];
          setOrganizations(list);
          setTotal(list.length);
          setTotalPages(1);
          return;
        }
      }

      const orgs = await branchService.getOrganizations(token);
      const list = Array.isArray(orgs) ? orgs : [];
      const filtered = list.filter((o) => {
        const q = searchTerm.trim().toLowerCase();
        if (q) {
          const nameMatch = (o.name || "").toLowerCase().includes(q);
          const slugMatch = (o.slug || "").toLowerCase().includes(q);
          if (!nameMatch && !slugMatch) return false;
        }

        if (statusFilter === "inactive") return o.isActive === false;
        return true;
      });

      setOrganizations(filtered);
      setTotal(filtered.length);
      setTotalPages(1);
    } catch (e: any) {
      toast.error(e?.message || t("admin.organizations.loadFailed", { defaultValue: "Failed to load organizations" }));
    } finally {
      setLoading(false);
    }
  }, [currentPage, getToken, isSuperAdmin, searchTerm, statusFilter, t]);

  const openValidationDialog = (org: Organization) => {
    setSelectedOrgForValidation(org);
    setValidationMode("create");
    setExistingValidation(null);
    setValidationDialogOpen(true);
  };

  const openEditValidationDialog = async (org: Organization) => {
    try {
      const token = await getToken();
      if (!token) return;

      const response = await branchService.getOrganizationValidation(org.id, token);
      const latestValidation =
        response.validations && response.validations.length > 0
          ? response.validations[0]
          : null;
      
      // Find the associated payment for this validation
      const associatedPayment = latestValidation && response.validationPayments
        ? response.validationPayments.find((payment: any) => payment.validationId === latestValidation.id)
        : null;

      if (!latestValidation) {
        toast.error(
          t("admin.organizations.validation.noValidationFound", {
            defaultValue: "No validation found",
          })
        );
        return;
      }

      // Merge validation and payment data
      const validationWithPayment = {
        ...latestValidation,
        amount: associatedPayment?.amount,
        currency: associatedPayment?.currency,
        paymentMethod: associatedPayment?.paymentMethod,
        paymentStatus: associatedPayment?.paymentStatus,
      };

      setSelectedOrgForValidation(org);
      setValidationMode("edit");
      setExistingValidation(validationWithPayment);
      setValidationDialogOpen(true);
    } catch (error: any) {
      toast.error(
        error?.message ||
          t("admin.organizations.validation.fetchValidationFailed", {
            defaultValue: "Failed to fetch validation details",
          })
      );
    }
  };

  const unvalidateValidation = (org: Organization) => {
    if (!org.validations || org.validations.length === 0) {
      toast.error(
        t("admin.organizations.validation.noValidationToUnvalidate", {
          defaultValue: "No validation to unvalidate",
        })
      );
      return;
    }

    const latestValidation = org.validations[0];
    setSelectedOrgForUnvalidate(org);
    setSelectedValidationIdForUnvalidate(latestValidation.id);
    setUnvalidateDialogOpen(true);
  };

  const reactivateValidation = async (org: Organization) => {
    if (!org.validations || org.validations.length === 0) {
      toast.error(
        t("admin.organizations.validation.noValidationToReactivate", {
          defaultValue: "No validation to reactivate",
        })
      );
      return;
    }

    try {
      const token = await getToken();
      if (!token) return;

      const latestValidation = org.validations[0];
      await branchService.reactivateValidation(org.id, latestValidation.id, token);
      toast.success(
        t("admin.organizations.validation.reactivated", {
          defaultValue: "Validation reactivated for {{orgName}}",
          orgName: org.name,
        })
      );
      refreshOrganizations();
    } catch (error: any) {
      toast.error(
        error?.message ||
          t("admin.organizations.validation.reactivateFailed", {
            defaultValue: "Failed to reactivate validation",
          })
      );
    }
  };

  useEffect(() => {
    refreshOrganizations();
  }, [refreshOrganizations]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const resetForm = () => {
    setActiveOrg(null);
    setName("");
    setMaxActiveBranches("");
    setFreeVersion(false);
    setReservationsAllowed(true);
    setOnlinePaymentsAllowed(true);
    setCardPaymentsAllowed(true);
    setPaypalAllowed(true);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (org: Organization) => {
    setActiveOrg(org);
    setName(org.name || "");
    setMaxActiveBranches(
      org.freeVersion === true 
        ? "1"
        : org.maxActiveBranches !== null && org.maxActiveBranches !== undefined
        ? String(org.maxActiveBranches)
        : ""
    );
    setFreeVersion(org.freeVersion === true);
    setReservationsAllowed(org.reservationsAllowed !== false);
    setOnlinePaymentsAllowed(org.onlinePaymentsAllowed !== false);
    setCardPaymentsAllowed(org.cardPaymentsAllowed !== false);
    setPaypalAllowed(org.paypalAllowed !== false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("admin.organizations.nameRequired", { defaultValue: "Name is required" }));
      return;
    }

    const token = await getToken();
    if (!token) return;

    setSaving(true);
    try {
      if (activeOrg) {
        const payload: any = { name: trimmed };
        if (isSuperAdmin) {
          const raw = maxActiveBranches.trim();
          payload.maxActiveBranches = raw.length === 0 ? null : Number(raw);
          payload.freeVersion = Boolean(freeVersion);
          if (!freeVersion) {
            payload.reservationsAllowed = Boolean(reservationsAllowed);
            payload.onlinePaymentsAllowed = Boolean(onlinePaymentsAllowed);
            payload.cardPaymentsAllowed = Boolean(cardPaymentsAllowed);
            payload.paypalAllowed = Boolean(paypalAllowed);
          }
        }
        await branchService.updateOrganization(activeOrg.id, payload, token);
        toast.success(t("admin.organizations.updated", { defaultValue: "Organization updated" }));
      } else {
        const payload: any = { name: trimmed };
        if (isSuperAdmin) {
          const raw = maxActiveBranches.trim();
          payload.maxActiveBranches = raw.length === 0 ? null : Number(raw);
          payload.freeVersion = Boolean(freeVersion);
          if (!freeVersion) {
            payload.reservationsAllowed = Boolean(reservationsAllowed);
            payload.onlinePaymentsAllowed = Boolean(onlinePaymentsAllowed);
            payload.cardPaymentsAllowed = Boolean(cardPaymentsAllowed);
            payload.paypalAllowed = Boolean(paypalAllowed);
          }
        }
        await branchService.createOrganization(payload, token);
        toast.success(t("admin.organizations.created", { defaultValue: "Organization created" }));
      }

      setDialogOpen(false);
      resetForm();
      await refreshOrganizations();
    } catch (e: any) {
      toast.error(e?.message || t("admin.organizations.saveFailed", { defaultValue: "Failed to save organization" }));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (org: Organization, nextActive: boolean) => {
    const token = await getToken();
    if (!token) return;

    setActionLoadingId(org.id);
    try {
      await branchService.updateOrganization(org.id, { isActive: nextActive }, token);
      setOrganizations((prev) =>
        prev.map((o) => (o.id === org.id ? { ...o, isActive: nextActive } : o))
      );
    } catch (e: any) {
      toast.error(e?.message || t("admin.organizations.toggleFailed", { defaultValue: "Failed to update organization" }));
    } finally {
      setActionLoadingId(null);
    }
  };

  const organizationCards = useMemo(() => {
    const getValidationBadge = (org: Organization) => {
      // Temporarily unvalidated (has validations but org.isValidated is false)
      if (!org.isValidated && org.validations && org.validations.length > 0) {
        const latestValidation = org.validations[0];
        if (latestValidation.isActive === false && latestValidation.unvalidatedAt) {
          return {
            status: "temporarily_unvalidated" as const,
            label: t("admin.organizations.validation.temporarilyUnvalidated", {
              defaultValue: "Temporarily deactivated",
            }),
            className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
            icon: mdiPause,
          };
        }
      }

      if (!org.isValidated) {
        return {
          status: "unvalidated" as const,
          label: t("admin.organizations.validation.unvalidated", { defaultValue: "Unvalidated" }),
          className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
          icon: mdiAlertCircle,
        };
      }

      const now = new Date();
      const latestValidation = org.validations && org.validations.length > 0 ? org.validations[0] : null;
      const expiresAt = latestValidation?.expiresAt
        ? new Date(latestValidation.expiresAt)
        : org.validationExpiresAt
          ? new Date(org.validationExpiresAt)
          : null;
      const gracePeriodEndsAt = latestValidation?.gracePeriodEndsAt
        ? new Date(latestValidation.gracePeriodEndsAt)
        : org.gracePeriodEndsAt
          ? new Date(org.gracePeriodEndsAt)
          : null;

      if (!expiresAt) {
        return {
          status: "unvalidated" as const,
          label: t("admin.organizations.validation.unvalidated", { defaultValue: "Unvalidated" }),
          className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
          icon: mdiAlertCircle,
        };
      }

      if (now <= expiresAt) {
        return {
          status: "valid" as const,
          label: t("admin.organizations.validation.valid", { defaultValue: "Valid" }),
          className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
          icon: mdiCheckCircle,
        };
      }

      if (gracePeriodEndsAt && now <= gracePeriodEndsAt) {
        return {
          status: "grace_period" as const,
          label: t("admin.organizations.validation.gracePeriod", { defaultValue: "Grace period" }),
          className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
          icon: mdiClock,
        };
      }

      return {
        status: "expired" as const,
        label: t("admin.organizations.validation.expired", { defaultValue: "Expired" }),
        className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
        icon: mdiAlertCircle,
      };
    };

    return organizations.map((org) => {
      const isActive = org.isActive !== false;
      const statusLabel = isActive
        ? t("admin.organizations.active", { defaultValue: "Active" })
        : t("admin.organizations.inactive", { defaultValue: "Inactive" });

      const validationBadge = isSuperAdmin ? getValidationBadge(org) : null;

      return (
        <Card key={org.id} className="border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium truncate">{org.name}</div>
                  <span
                    className={
                      "px-2 py-0.5 text-xs rounded-full " +
                      (isActive
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")
                    }
                  >
                    {statusLabel}
                  </span>

                  {validationBadge ? (
                    <span className={"px-2 py-0.5 text-xs rounded-full inline-flex items-center gap-1 " + validationBadge.className}>
                      <Icon path={validationBadge.icon} size={0.55} />
                      {validationBadge.label}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {t("admin.organizations.slug", { defaultValue: "Slug" })}: {org.slug || "-"}
                </div>

                {/* Validation information - matching React frontend */}
                {org.isValidated && isSuperAdmin && (
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {(() => {
                      const latestValidation = org.validations && org.validations.length > 0 ? org.validations[0] : null;
                      const expiresDate = latestValidation?.expiresAt || org.validationExpiresAt;
                      
                      if (expiresDate) {
                        const formattedDate = new Date(expiresDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        });
                        return (
                          <div>
                            {t("admin.organizations.validation.expiresOn", { defaultValue: "Expires on" })}: {formattedDate}
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    {(() => {
                      const latestValidation = org.validations && org.validations.length > 0 ? org.validations[0] : null;
                      const gracePeriodDate = latestValidation?.gracePeriodEndsAt || org.gracePeriodEndsAt;
                      const now = new Date();

                      if (validationBadge?.status === "grace_period" && gracePeriodDate && new Date(gracePeriodDate) >= now) {
                        const formattedDate = new Date(gracePeriodDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        });
                        return (
                          <div className="text-yellow-600 dark:text-yellow-400">
                            {t("admin.organizations.validation.gracePeriodEnds", { defaultValue: "Grace period ends" })}: {formattedDate}
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    {(() => {
                      const latestValidation = org.validations && org.validations.length > 0 ? org.validations[0] : null;
                      if (latestValidation?.notes) {
                        return (
                          <div className="truncate">
                            {t("admin.organizations.validation.validationNotes", { defaultValue: "Validation notes" })}: {latestValidation.notes}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Branch count - matching React frontend */}
                {org._count && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {t("admin.organizations.branchCount", { 
                      defaultValue: "{{count}} branches",
                      count: org._count.branches || 0 
                    })}
                  </div>
                )}
              </div>

              <DropdownMenu
                open={openMenuId === org.id}
                onOpenChange={(open) => setOpenMenuId(open ? org.id : null)}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0 touch-manipulation relative z-10 pointer-events-auto"
                    onPointerDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={() => {
                      setOpenMenuId((prev) => (prev === org.id ? null : org.id));
                    }}
                  >
                    <Icon path={mdiDotsVertical} size={0.67} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setOpenMenuId(null);
                      openEdit(org);
                    }}
                    disabled={actionLoadingId === org.id}
                  >
                    <Icon path={mdiPencil} size={0.67} className="mr-2" />
                    {t("admin.organizations.edit", { defaultValue: "Edit organization" })}
                  </DropdownMenuItem>

                  {isSuperAdmin ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => {
                          setOpenMenuId(null);
                          openValidationDialog(org);
                        }}
                        disabled={actionLoadingId === org.id}
                      >
                        <Icon path={mdiPlus} size={0.67} className="mr-2" />
                        {org.isValidated 
                          ? t("admin.organizations.validation.revalidate", {
                              defaultValue: "Re-Validate",
                            })
                          : t("admin.organizations.validation.validateOrganization", {
                              defaultValue: "Validate organization",
                            })
                        }
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={() => {
                          setOpenMenuId(null);
                          openEditValidationDialog(org);
                        }}
                        disabled={actionLoadingId === org.id}
                      >
                        <Icon path={mdiPencil} size={0.67} className="mr-2" />
                        {t("admin.organizations.validation.editValidation", {
                          defaultValue: "Edit validation",
                        })}
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={() => {
                          setOpenMenuId(null);
                          unvalidateValidation(org);
                        }}
                        disabled={actionLoadingId === org.id}
                        className="text-orange-600"
                      >
                        <Icon path={mdiPause} size={0.67} className="mr-2" />
                        {t("admin.organizations.validation.temporarilyUnvalidate", {
                          defaultValue: "Temporarily unvalidate",
                        })}
                      </DropdownMenuItem>

                      {org.validations &&
                      org.validations.length > 0 &&
                      org.validations[0]?.isActive === false &&
                      org.validations[0]?.unvalidatedAt ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenMenuId(null);
                            reactivateValidation(org);
                          }}
                          disabled={actionLoadingId === org.id}
                          className="text-green-600"
                        >
                          <Icon path={mdiCheckCircle} size={0.67} className="mr-2" />
                          {t("admin.organizations.validation.reactivateValidation", {
                            defaultValue: "Re-validate",
                          })}
                        </DropdownMenuItem>
                      ) : null}
                    </>
                  ) : null}

                  <DropdownMenuItem
                    onClick={() => {
                      setOpenMenuId(null);
                      toggleActive(org, !isActive);
                    }}
                    disabled={actionLoadingId === org.id}
                  >
                    {isActive ? (
                      <>
                        <Icon path={mdiEyeOff} size={0.67} className="mr-2" />
                        {t("admin.organizations.deactivate", { defaultValue: "Deactivate" })}
                      </>
                    ) : (
                      <>
                        <Icon path={mdiEye} size={0.67} className="mr-2" />
                        {t("admin.organizations.activate", { defaultValue: "Activate" })}
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      );
    });
  }, [actionLoadingId, openMenuId, organizations, t, isSuperAdmin]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={t("admin.organizations.title", { defaultValue: "Organizations" })}
        description={t("admin.organizations.description", { defaultValue: "Create and manage organizations." })}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{t("admin.organizations.title", { defaultValue: "Organizations" })}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => refreshOrganizations()}
                disabled={loading}
              >
                <Icon path={mdiRefresh} size={0.67} className="mr-2" />
                {t("common.refresh", { defaultValue: "Refresh" })}
              </Button>
              <Button
                onClick={openCreate}
                disabled={loading}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                <Icon path={mdiPlus} size={0.67} className="mr-2" />
                {t("admin.organizations.create", { defaultValue: "Create organization" })}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-end">
            <div className="flex-1">
              <Label className="text-sm font-medium">
                {t("admin.organizations.filters.search", { defaultValue: "Search" })}
              </Label>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("admin.organizations.filters.searchPlaceholder", {
                  defaultValue: "Search organizations...",
                })}
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="w-full md:w-64">
              <Label className="text-sm font-medium">
                {t("admin.organizations.filters.status", { defaultValue: "Status" })}
              </Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as any)}
              >
                <SelectTrigger className="bg-transparent border-border">
                  <SelectValue placeholder={t("admin.organizations.filters.all", { defaultValue: "All" })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin.organizations.filters.all", { defaultValue: "All" })}</SelectItem>
                  <SelectItem value="validated">{t("admin.organizations.filters.validated", { defaultValue: "Validated" })}</SelectItem>
                  <SelectItem value="unvalidated">{t("admin.organizations.filters.unvalidated", { defaultValue: "Unvalidated" })}</SelectItem>
                  <SelectItem value="expired">{t("admin.organizations.filters.expired", { defaultValue: "Expired" })}</SelectItem>
                  <SelectItem value="grace_period">{t("admin.organizations.filters.gracePeriod", { defaultValue: "Grace period" })}</SelectItem>
                  <SelectItem value="inactive">{t("admin.organizations.filters.inactive", { defaultValue: "Inactive" })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">
              {t("common.loading", { defaultValue: "Loading..." })}
            </div>
          ) : organizations.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {t("admin.organizations.empty", { defaultValue: "No organizations yet." })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{organizationCards}</div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="text-sm text-muted-foreground">
              {t("admin.organizations.pagination", {
                defaultValue: "Page {{current}} of {{total}}",
                current: currentPage,
                total: totalPages,
              })}
              {" · "}
              {t("admin.organizations.totalCount", {
                defaultValue: "Total: {{count}}",
                count: total,
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={loading || currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                {t("common.previous", { defaultValue: "Previous" })}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading || currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                {t("common.next", { defaultValue: "Next" })}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-card text-foreground border-border">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-semibold text-white">
              {activeOrg
                ? t("admin.organizations.edit", { defaultValue: "Edit organization" })
                : t("admin.organizations.create", { defaultValue: "Create organization" })}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("admin.organizations.name", { defaultValue: "Name" })} <span className="text-red-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("admin.organizations.namePlaceholder", { defaultValue: "Organization name" })}
                required
                className="bg-transparent text-foreground border-border"
              />
            </div>

            {isSuperAdmin ? (
              <div className="space-y-4 pt-2">
                <div className="text-sm font-medium">
                  {t("admin.organizations.entitlements", { defaultValue: "Entitlements" })}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">
                    {t("admin.organizations.freeVersion", { defaultValue: "Free version" })}
                  </Label>
                  <Switch
                    checked={freeVersion}
                    onCheckedChange={(v: boolean) => {
                      const next = Boolean(v);
                      setFreeVersion(next);
                      if (next) {
                        // When free version is enabled, disable all paid features and set max branches to 1
                        setReservationsAllowed(false);
                        setOnlinePaymentsAllowed(false);
                        setCardPaymentsAllowed(false);
                        setPaypalAllowed(false);
                        setMaxActiveBranches("1");
                      }
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t("admin.organizations.maxActiveBranches", { defaultValue: "Max active branches" })}
                  </Label>
                  <Input
                    value={maxActiveBranches}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") {
                        setMaxActiveBranches("");
                        return;
                      }
                      if (/^\d+$/.test(v)) {
                        const num = Number(v);
                        // Limit to 1 when free version is enabled
                        if (freeVersion && num > 1) {
                          return;
                        }
                        setMaxActiveBranches(v);
                      }
                    }}
                    placeholder={t("admin.organizations.maxActiveBranchesPlaceholder", { defaultValue: "Unlimited" })}
                    className="bg-transparent text-foreground border-border"
                    disabled={freeVersion}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">
                    {t("admin.organizations.reservationsAllowed", { defaultValue: "Reservations allowed" })}
                  </Label>
                  <Switch
                    checked={reservationsAllowed}
                    onCheckedChange={(v: boolean) => setReservationsAllowed(Boolean(v))}
                    disabled={freeVersion}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">
                    {t("admin.organizations.onlinePaymentsAllowed", { defaultValue: "Online payments allowed" })}
                  </Label>
                  <Switch
                    checked={onlinePaymentsAllowed}
                    onCheckedChange={(v: boolean) => {
                      const next = Boolean(v);
                      setOnlinePaymentsAllowed(next);
                      if (!next) {
                        setCardPaymentsAllowed(false);
                        setPaypalAllowed(false);
                      }
                    }}
                    disabled={freeVersion}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">
                    {t("admin.organizations.cardPaymentsAllowed", { defaultValue: "Card payments allowed" })}
                  </Label>
                  <Switch
                    checked={cardPaymentsAllowed}
                    onCheckedChange={(v: boolean) => {
                      const next = Boolean(v);
                      setCardPaymentsAllowed(next);
                      if (next) setOnlinePaymentsAllowed(true);
                    }}
                    disabled={freeVersion}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">
                    {t("admin.organizations.paypalAllowed", { defaultValue: "PayPal allowed" })}
                  </Label>
                  <Switch
                    checked={paypalAllowed}
                    onCheckedChange={(v: boolean) => {
                      const next = Boolean(v);
                      setPaypalAllowed(next);
                      if (next) setOnlinePaymentsAllowed(true);
                    }}
                    disabled={freeVersion}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button
                type="button"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                type="submit"
                disabled={saving || !name.trim()}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {saving ? (
                  <>
                    <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                    {t("common.saving", { defaultValue: "Saving..." })}
                  </>
                ) : (
                  t("common.save", { defaultValue: "Save" })
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ValidationDialog
        open={validationDialogOpen}
        onOpenChange={setValidationDialogOpen}
        organization={selectedOrgForValidation}
        mode={validationMode}
        existingValidation={existingValidation}
        onSuccess={() => refreshOrganizations()}
      />

      <UnvalidateValidationDialog
        open={unvalidateDialogOpen}
        onOpenChange={setUnvalidateDialogOpen}
        organization={selectedOrgForUnvalidate}
        validationId={selectedValidationIdForUnvalidate}
        onSuccess={() => refreshOrganizations()}
      />
    </div>
  );
};

export default OrganizationsManagement;
