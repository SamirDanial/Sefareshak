import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import branchService, { type Organization } from "@/services/branchService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  mdiPencil,
  mdiEye, 
  mdiEyeOff,
  mdiCalendar,
  mdiClock,
  mdiAlertCircle,
  mdiCheckCircle,
  mdiPause,
  mdiDotsVertical,
  mdiPlus,
  mdiRefresh
} from "@mdi/js";
import ValidationDialog from "@/components/admin/ValidationDialog";
import UnvalidateValidationDialog from "@/components/admin/UnvalidateValidationDialog";

const OrganizationsManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { userType } = useAuth();
  const isSuperAdmin = userType === "SUPER_ADMIN";

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
  
  // Validation states
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [selectedOrgForValidation, setSelectedOrgForValidation] = useState<Organization | null>(null);
  const [validationMode, setValidationMode] = useState<"create" | "edit">("create");
  const [existingValidation, setExistingValidation] = useState<any>(null);
  
  // Unvalidate validation dialog states
  const [unvalidateDialogOpen, setUnvalidateDialogOpen] = useState(false);
  const [selectedOrgForUnvalidate, setSelectedOrgForUnvalidate] = useState<Organization | null>(null);
  const [selectedValidationIdForUnvalidate, setSelectedValidationIdForUnvalidate] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "validated" | "unvalidated" | "expired" | "grace_period" | "inactive">("validated");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const refreshOrganizations = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setOrganizations([]);
      return;
    }

    setLoading(true);
    try {
      // Use the new validation API for super admin, fallback to regular API for others
      if (isSuperAdmin) {
        const options: any = {
          page: currentPage,
          limit: 10,
        };
        if (searchTerm) options.search = searchTerm;
        if (statusFilter !== "all") options.status = statusFilter;
        
        try {
          const response = await branchService.getOrganizationsWithValidation(token, options);
          setOrganizations(response.data || []);
          setTotal(response.pagination?.total || 0);
          setTotalPages(response.pagination?.totalPages || 1);
        } catch (validationError: any) {
          console.warn("Validation API failed, falling back to regular API:", validationError);
          // Fallback to regular API if validation API fails
          const orgs = await branchService.getOrganizations(token);
          setOrganizations(orgs);
          setTotal(orgs.length);
          setTotalPages(1);
        }
      } else {
        const orgs = await branchService.getOrganizations(token);
        setOrganizations(orgs);
        setTotal(orgs.length);
        setTotalPages(1);
      }
    } catch (error: any) {
      console.error("Error fetching organizations:", error);
      toast.error("Failed to fetch organizations");
    } finally {
      setLoading(false);
    }
  }, [getToken, isSuperAdmin, searchTerm, statusFilter, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // Refresh data when dependencies change
  useEffect(() => {
    refreshOrganizations();
  }, [refreshOrganizations]);

  // Helper function to get validation status
  const getValidationStatus = (org: Organization) => {
    // Check for temporarily unvalidated (has validations but org.isValidated is false)
    if (!org.isValidated && org.validations && org.validations.length > 0) {
      const latestValidation = org.validations[0];
      if (latestValidation.isActive === false && latestValidation.unvalidatedAt) {
        return {
          status: "temporarily_unvalidated",
          label: t("admin.organizations.validation.temporarilyUnvalidated"),
          color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
          icon: mdiPause,
        };
      }
    }

    if (!org.isValidated) {
      return {
        status: "unvalidated",
        label: t("admin.organizations.validation.unvalidated"),
        color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
        icon: mdiAlertCircle,
      };
    }

    const now = new Date();
    const expiresAt = org.validationExpiresAt ? new Date(org.validationExpiresAt) : null;
    const gracePeriodEndsAt = org.gracePeriodEndsAt ? new Date(org.gracePeriodEndsAt) : null;

    if (!expiresAt) {
      return {
        status: "unvalidated",
        label: t("admin.validation.unvalidated", { defaultValue: "Unvalidated" }),
        color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
        icon: mdiAlertCircle,
      };
    }

    if (now <= expiresAt) {
      return {
        status: "valid",
        label: t("admin.organizations.validation.valid"),
        color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        icon: mdiCheckCircle,
      };
    }

    if (gracePeriodEndsAt && now <= gracePeriodEndsAt) {
      return {
        status: "grace_period",
        label: t("admin.organizations.validation.gracePeriod"),
        color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
        icon: mdiClock,
      };
    }

    return {
      status: "expired",
      label: t("admin.organizations.validation.expired"),
      color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      icon: mdiAlertCircle,
    };
  };

  // Helper function to format date
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Open validation dialog
  const openValidationDialog = (org: Organization) => {
    setSelectedOrgForValidation(org);
    setValidationMode("create");
    setExistingValidation(null);
    setValidationDialogOpen(true);
  };

  // Open edit validation dialog
  const openEditValidationDialog = async (org: Organization) => {
    try {
      const token = await getToken();
      if (!token) return;

      // Fetch existing validation details
      const response = await branchService.getOrganizationValidation(org.id, token);
      
      // Extract the latest validation from the response
      const latestValidation = response.validations && response.validations.length > 0 
        ? response.validations[0] 
        : null;
      
      const latestPayment = response.validationPayments && response.validationPayments.length > 0
        ? response.validationPayments[0]
        : null;

      if (!latestValidation) {
        toast.error("No validation found for this organization");
        return;
      }

      // Combine validation and payment data for the form
      const validationData = {
        ...latestValidation,
        amount: latestPayment?.amount,
        currency: latestPayment?.currency,
        paymentMethod: latestPayment?.paymentMethod,
        paymentStatus: latestPayment?.paymentStatus || "PENDING",
      };

      setSelectedOrgForValidation(org);
      setValidationMode("edit");
      setExistingValidation(validationData);
      setValidationDialogOpen(true);
    } catch (error: any) {
      console.error("Error fetching validation details:", error);
      toast.error("Failed to fetch validation details");
    }
  };

  // Unvalidate validation (temporary for non-payment)
  const unvalidateValidation = (org: Organization) => {
    if (!org.validations || org.validations.length === 0) {
      toast.error(t("admin.organizations.validation.noValidationToUnvalidate"));
      return;
    }

    const latestValidation = org.validations[0];
    setSelectedOrgForUnvalidate(org);
    setSelectedValidationIdForUnvalidate(latestValidation.id);
    setUnvalidateDialogOpen(true);
  };

  // Reactivate validation (restore temporarily unvalidated validation)
  const reactivateValidation = async (org: Organization) => {
    if (!org.validations || org.validations.length === 0) {
      toast.error(t("admin.organizations.validation.noValidationToReactivate"));
      return;
    }

    try {
      const token = await getToken();
      if (!token) return;

      const latestValidation = org.validations[0];
      await branchService.reactivateValidation(org.id, latestValidation.id, token);
      
      toast.success(t("admin.organizations.validation.reactivated", { orgName: org.name }));
      refreshOrganizations();
    } catch (error: any) {
      console.error("Error reactivating validation:", error);
      toast.error(t("admin.organizations.validation.reactivateFailed"));
    }
  };

  useEffect(() => {
    refreshOrganizations();
  }, [refreshOrganizations]);

  const openCreate = () => {
    setActiveOrg(null);
    setName("");
    setMaxActiveBranches("");
    setFreeVersion(false);
    setReservationsAllowed(true);
    setOnlinePaymentsAllowed(true);
    setCardPaymentsAllowed(true);
    setPaypalAllowed(true);
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
      setActiveOrg(null);
      setName("");
      setMaxActiveBranches("");
      setFreeVersion(false);
      setReservationsAllowed(true);
      setOnlinePaymentsAllowed(true);
      setCardPaymentsAllowed(true);
      setPaypalAllowed(true);
      await refreshOrganizations();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save organization");
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
      toast.error(e?.message || "Failed to update organization");
    } finally {
      setActionLoadingId(null);
    }
  };

  const organizationCards = useMemo(() => {
    if (!organizations || !Array.isArray(organizations)) {
      return [];
    }
    
    return organizations.map((org) => {
      const isActive = org.isActive !== false;
      const activeStatus = isActive
        ? t("admin.organizations.active", { defaultValue: "Active" })
        : t("admin.organizations.inactive", { defaultValue: "Inactive" });
      
      const validationStatus = getValidationStatus(org);
      // Get expiration date from the latest validation record, not the organization field
      const latestValidation = org.validations && org.validations.length > 0 ? org.validations[0] : null;
      const expiresDate = formatDate(latestValidation?.expiresAt || org.validationExpiresAt);
      const gracePeriodDate = formatDate(latestValidation?.gracePeriodEndsAt || org.gracePeriodEndsAt);

      return (
        <Card key={org.id} className="border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-medium truncate">{org.name}</div>
                  <span
                    className={
                      "px-2 py-0.5 text-xs rounded-full " +
                      (isActive
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")
                    }
                  >
                    {activeStatus}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full flex items-center gap-1 ${validationStatus.color}`}
                  >
                    <Icon path={validationStatus.icon} size={0.5} />
                    {validationStatus.label}
                  </span>
                </div>
                
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {t("common.slug", { defaultValue: "Slug" })}: {org.slug}
                </div>

                {/* Validation information */}
                {org.isValidated && (
                  <div className="mt-2 space-y-1">
                    {expiresDate && (
                      <div className="text-xs text-muted-foreground">
                        {t("admin.organizations.validation.expiresOn")}: {expiresDate}
                      </div>
                    )}
                    {validationStatus.status === "grace_period" && gracePeriodDate && (
                      <div className="text-xs text-yellow-600 dark:text-yellow-400">
                        {t("admin.organizations.validation.gracePeriodEnds")}: {gracePeriodDate}
                      </div>
                    )}
                    {latestValidation?.notes && (
                      <div className="text-xs text-muted-foreground truncate">
                        {t("admin.organizations.validation.validationNotes")}: {latestValidation.notes}
                      </div>
                    )}
                  </div>
                )}

                {/* Branch count */}
                {org._count && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {t("admin.organizations.branchCount", { 
                      defaultValue: "{{count}} branches",
                      count: org._count?.branches || 0 
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
                  
                  {isSuperAdmin && (
                    <>
                      <DropdownMenuItem
                        onClick={() => {
                          setOpenMenuId(null);
                          openValidationDialog(org);
                        }}
                        disabled={actionLoadingId === org.id}
                      >
                        <Icon path={mdiCalendar} size={0.67} className="mr-2" />
                        {org.isValidated 
                          ? t("admin.organizations.validation.revalidate")
                          : t("admin.organizations.validation.validateOrganization")
                        }
                      </DropdownMenuItem>
                      
                      {org.isValidated && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenMenuId(null);
                            openEditValidationDialog(org);
                          }}
                          disabled={actionLoadingId === org.id}
                        >
                          <Icon path={mdiPencil} size={0.67} className="mr-2" />
                          {t("admin.organizations.validation.editValidation")}
                        </DropdownMenuItem>
                      )}
                      
                      {org.isValidated && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenMenuId(null);
                            unvalidateValidation(org);
                          }}
                          disabled={actionLoadingId === org.id}
                          className="text-orange-600"
                        >
                          <Icon path={mdiPause} size={0.67} className="mr-2" />
                          {t("admin.organizations.validation.temporarilyUnvalidate")}
                        </DropdownMenuItem>
                      )}
                      
                      {/* Show Reactivate option for temporarily unvalidated organizations */}
                      {!org.isValidated && org.validations && org.validations.length > 0 && org.validations[0].isActive === false && org.validations[0].unvalidatedAt && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpenMenuId(null);
                            reactivateValidation(org);
                          }}
                          disabled={actionLoadingId === org.id}
                          className="text-green-600"
                        >
                          <Icon path={mdiCheckCircle} size={0.67} className="mr-2" />
                          {t("admin.organizations.validation.reactivateValidation")}
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  
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
  }, [actionLoadingId, openMenuId, organizations, t, isSuperAdmin, getValidationStatus, formatDate, openEdit, toggleActive, openValidationDialog]);

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-pink-500">
          {t("admin.organizations.title", { defaultValue: "Organizations" })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("admin.organizations.description", {
            defaultValue: "Create and manage organizations.",
          })}
        </p>
      </div>

      {/* Search and Filter Controls - Only for Super Admin */}
      {isSuperAdmin && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Input
                  placeholder={t("admin.organizations.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent text-foreground border-border"
                />
              </div>
              <div className="sm:w-48">
                <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("admin.organizations.validation.allStatuses")}
                    </SelectItem>
                    <SelectItem value="validated">
                      {t("admin.organizations.validation.validated")}
                    </SelectItem>
                    <SelectItem value="unvalidated">
                      {t("admin.organizations.validation.unvalidated")}
                    </SelectItem>
                    <SelectItem value="expired">
                      {t("admin.organizations.validation.expired")}
                    </SelectItem>
                    <SelectItem value="grace_period">
                      {t("admin.organizations.validation.gracePeriod")}
                    </SelectItem>
                    <SelectItem value="inactive">
                      {t("admin.organizations.inactive")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{t("admin.organizations.title", { defaultValue: "Organizations" })}</CardTitle>
            <div className="flex items-center gap-2">
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
          {loading ? (
            <div className="text-sm text-muted-foreground">
              {t("common.loading", { defaultValue: "Loading..." })}
            </div>
          ) : organizations.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {searchTerm || statusFilter !== "all"
                ? t("admin.organizations.noResults", { defaultValue: "No organizations found matching your criteria." })
                : t("admin.organizations.empty", { defaultValue: "No organizations yet." })
              }
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {organizationCards}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {!loading && organizations.length > 0 && totalPages > 1 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {t("admin.organizations.showingResults", { 
                  defaultValue: "Showing {{start}}-{{end}} of {{total}} results",
                  start: (currentPage - 1) * 10 + 1,
                  end: Math.min(currentPage * 10, total),
                  total: total
                })}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  {t("common.previous", { defaultValue: "Previous" })}
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {t("admin.organizations.pageInfo", { 
                    defaultValue: "Page {{current}} of {{total}}",
                    current: currentPage,
                    total: totalPages
                  })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  {t("common.next", { defaultValue: "Next" })}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Organization Create/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setActiveOrg(null);
            setName("");
            setMaxActiveBranches("");
            setFreeVersion(false);
            setReservationsAllowed(true);
            setOnlinePaymentsAllowed(true);
            setCardPaymentsAllowed(true);
            setPaypalAllowed(true);
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
                {t("admin.organizations.name", { defaultValue: "Name" })}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("admin.organizations.namePlaceholder", {
                  defaultValue: "Organization name",
                })}
                required
                className="bg-transparent text-foreground border-border"
              />
            </div>

            {isSuperAdmin && (
              <div className="space-y-4 pt-2">
                <div className="text-sm font-medium">
                  {t("admin.organizations.entitlements", { defaultValue: "Entitlements" })}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">
                    {t("admin.organizations.freeVersion", {
                      defaultValue: "Free version",
                    })}
                  </Label>
                  <Switch
                    checked={freeVersion}
                    onCheckedChange={(v) => {
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
                    {t("admin.organizations.maxActiveBranches", {
                      defaultValue: "Max active branches",
                    })}
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
                    placeholder={t("admin.organizations.maxActiveBranchesPlaceholder", {
                      defaultValue: "Unlimited",
                    })}
                    className="bg-transparent text-foreground border-border"
                    disabled={freeVersion}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">
                    {t("admin.organizations.reservationsAllowed", {
                      defaultValue: "Reservations allowed",
                    })}
                  </Label>
                  <Switch
                    checked={reservationsAllowed}
                    onCheckedChange={(v) => setReservationsAllowed(Boolean(v))}
                    disabled={freeVersion}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">
                    {t("admin.organizations.onlinePaymentsAllowed", {
                      defaultValue: "Online payments allowed",
                    })}
                  </Label>
                  <Switch
                    checked={onlinePaymentsAllowed}
                    onCheckedChange={(v) => {
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
                    {t("admin.organizations.cardPaymentsAllowed", {
                      defaultValue: "Card payments allowed",
                    })}
                  </Label>
                  <Switch
                    checked={cardPaymentsAllowed}
                    onCheckedChange={(v) => {
                      const next = Boolean(v);
                      setCardPaymentsAllowed(next);
                      if (next) setOnlinePaymentsAllowed(true);
                    }}
                    disabled={freeVersion}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">
                    {t("admin.organizations.paypalAllowed", {
                      defaultValue: "PayPal allowed",
                    })}
                  </Label>
                  <Switch
                    checked={paypalAllowed}
                    onCheckedChange={(v) => {
                      const next = Boolean(v);
                      setPaypalAllowed(next);
                      if (next) setOnlinePaymentsAllowed(true);
                    }}
                    disabled={freeVersion}
                  />
                </div>
              </div>
            )}

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

      {/* Validation Dialog */}
      <ValidationDialog
        open={validationDialogOpen}
        onOpenChange={setValidationDialogOpen}
        organization={selectedOrgForValidation}
        mode={validationMode}
        existingValidation={existingValidation}
        onSuccess={() => {
          refreshOrganizations();
        }}
      />

      {/* Unvalidate Validation Dialog */}
      <UnvalidateValidationDialog
        open={unvalidateDialogOpen}
        onOpenChange={setUnvalidateDialogOpen}
        organization={selectedOrgForUnvalidate}
        validationId={selectedValidationIdForUnvalidate || ""}
        onSuccess={() => {
          refreshOrganizations();
        }}
      />
    </div>
  );
};

export default OrganizationsManagement;
