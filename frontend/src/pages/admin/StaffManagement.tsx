import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import Icon from "@mdi/react";
import {
  mdiAccountGroup,
  mdiMagnify,
  mdiRefresh,
  mdiPlus,
  mdiShieldCheck,
  mdiShield,
} from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import branchService from "@/services/branchService";
import {
  staffService,
  type StaffUser,
  type UserType,
  type StaffRole,
  type OrgRole,
} from "@/services/staffService";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const USER_TYPE_OPTIONS: Array<{ value: UserType; label: string }> = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "BRANCH_ADMIN", label: "Branch Admin" },
  { value: "EMPLOYEE", label: "Employee" },
  { value: "WAITER", label: "Waiter" },
  { value: "USER", label: "User" },
];

const isStaffUser = (u: StaffUser) => u.userType !== "USER" || Boolean(u.orgRole);

const getOrgRoleBadge = (r?: OrgRole | null) => {
  if (!r) return null;
  if (r === "ORG_OWNER") return { label: "ORG OWNER", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" };
  if (r === "ORG_ADMIN") return { label: "ORG ADMIN", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" };
  return { label: "ORG STAFF", className: "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100" };
};

const StaffManagement: React.FC = () => {
  const { getToken, userType, orgRole } = useAuth();
  const { rbacUser } = usePermissions();
  const { t } = useTranslation();

  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>(() => {
    try {
      return window.localStorage.getItem("bellami:selectedOrganizationId") || "";
    } catch {
      return "";
    }
  });

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [selectedUserType, setSelectedUserType] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code?: string | null }>>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);

  const [activeUser, setActiveUser] = useState<StaffUser | null>(null);
  const [editUserType, setEditUserType] = useState<UserType>("EMPLOYEE");
  const [editOrgRole, setEditOrgRole] = useState<OrgRole>("ORG_STAFF");
  const [editBranchIds, setEditBranchIds] = useState<string[]>([]);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [manageDialogOpen, setManageDialogOpen] = useState(false);

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<StaffUser | null>(null);
  const [removing, setRemoving] = useState(false);

  const [hireDialogOpen, setHireDialogOpen] = useState(false);
  const [hireEmail, setHireEmail] = useState("");
  const [hireSearching, setHireSearching] = useState(false);
  const [hireCandidate, setHireCandidate] = useState<StaffUser | null>(null);
  const [hireSaving, setHireSaving] = useState(false);

  const isSuperAdminEdit = editUserType === "SUPER_ADMIN";
  const isWaiterEdit = editUserType === "WAITER";
  const isEmployeeEdit = editUserType === "EMPLOYEE";
  const canEditBranchesMulti = editUserType === "BRANCH_ADMIN";
  const canEditRoles = editUserType === "EMPLOYEE";

  const currentUserId = rbacUser?.id;
  const isOrgOwnerViewer = orgRole === "ORG_OWNER";
  const isOrgAdminViewer = orgRole === "ORG_ADMIN";

  const canManageStaff = userType === "SUPER_ADMIN" || orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

  const confirmRemoveFromOrg = async () => {
    if (!removeTarget) return;
    if (isLastOrgOwner(removeTarget)) {
      toast.error(
        t("admin.staffManagement.lastOwnerRemoveBlocked", {
          defaultValue: "You can't remove the last ORG_OWNER from the organization",
        })
      );
      return;
    }
    try {
      setRemoving(true);
      const token = await getToken();
      await staffService.removeUserFromOrganization(removeTarget.id, token || undefined);
      toast.success(t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }));
      setManageDialogOpen(false);
      setActiveUser(null);
      await loadData();
    } catch (e: any) {
      const message = e?.response?.data?.error || e?.message || "Failed to save changes";
      toast.error(message);
      console.error("Failed to save staff user", e);
    } finally {
      setRemoving(false);
    }
  };

  const openHireDialog = () => {
    setHireEmail("");
    setHireCandidate(null);
    setHireDialogOpen(true);
  };

  const searchHireCandidate = async () => {
    const email = hireEmail.trim();
    if (!email) return;

    try {
      setHireSearching(true);
      setHireCandidate(null);
      const token = await getToken();
      const user = await staffService.searchHireCandidate(email, token || undefined);
      setHireCandidate(user);
    } catch (e: any) {
      const message = e?.response?.data?.error || e?.message;
      toast.error(
        message ||
          t("admin.staffManagement.hireSearchFailed", {
            defaultValue: "Failed to search user",
          })
      );
      setHireCandidate(null);
    } finally {
      setHireSearching(false);
    }
  };

  const confirmHire = async () => {
    if (!hireCandidate) return;

    try {
      setHireSaving(true);
      const token = await getToken();
      await staffService.hireStaff(hireCandidate.id, token || undefined);
      toast.success(
        t("admin.staffManagement.hireSuccess", {
          defaultValue: "User hired successfully",
        })
      );
      setHireDialogOpen(false);
      setHireEmail("");
      setHireCandidate(null);
      await loadData();
    } catch (e: any) {
      const raw = e?.response?.data?.error || e?.message || "Failed to hire user";
      const mapped =
        raw === "User already belongs to another organization"
          ? t("admin.staffManagement.hireAlreadyInOtherOrg", {
              defaultValue: "This user is already assigned to another organization",
            })
          : raw === "User is already in this organization"
          ? t("admin.staffManagement.hireAlreadyInThisOrg", {
              defaultValue: "This user is already in this organization",
            })
          : raw;
      toast.error(mapped);
    } finally {
      setHireSaving(false);
    }
  };

  const canRemoveFromOrg = (target: StaffUser) => {
    if (userType === "SUPER_ADMIN") return true;
    return orgRole === "ORG_OWNER" && (target.orgRole === "ORG_ADMIN" || target.orgRole === "ORG_STAFF");
  };

  const isLastOrgOwner = (target?: StaffUser | null) => {
    if (!target) return false;
    if (target.orgRole !== "ORG_OWNER") return false;
    const owners = (staff || []).filter((u): u is StaffUser => Boolean(u) && u.orgRole === "ORG_OWNER");
    return owners.length === 1 && owners[0]?.id === target.id;
  };

  const filteredStaff = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return staff.filter((u) => {
      if (term) {
        const name = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase();
        const email = (u.email || "").toLowerCase();
        if (!name.includes(term) && !email.includes(term)) return false;
      }
      return true;
    });
  }, [staff, searchTerm]);

  const loadData = async () => {
    try {
      setLoading(true);

      if (userType === "SUPER_ADMIN" && !selectedOrganizationId) {
        setStaff([]);
        setBranches([]);
        setRoles([]);
        return;
      }

      const token = await getToken();

      const [staffUsers, branchList, roleList] = await Promise.all([
        staffService.getStaff(
          {
            branchId: selectedBranchId || undefined,
            userType: (selectedUserType || undefined) as UserType | undefined,
            includeInactive,
            assignedOnly,
          },
          token || undefined
        ),
        branchService.getBranches(token || undefined),
        staffService.getRoles(false, token || undefined),
      ]);

      // Staff endpoint historically excluded USER; include USER if they have org membership (orgRole)
      setStaff(staffUsers.filter((u) => isStaffUser(u)));
      setBranches(
        (branchList || []).map((b: any) => ({
          id: b.id,
          name: (b.name || b.code || b.id) as string,
          code: b.code ?? null,
        }))
      );
      setRoles(roleList.filter((r) => (r.isActive ?? true) === true));
    } catch (e) {
      console.error("Failed to load staff management data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive, selectedUserType, selectedBranchId, assignedOnly, selectedOrganizationId]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "bellami:selectedOrganizationId") return;
      setSelectedOrganizationId((e.newValue || "").trim());
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const openManage = async (user: StaffUser) => {
    try {
      setActiveUser(user);
      setEditUserType(user.userType);
      setEditOrgRole((user.orgRole as OrgRole) || "ORG_STAFF");
      setManageDialogOpen(true);

      const token = await getToken();

      // ORG_OWNER managing themself: no branch/role details required.
      if (isOrgOwnerViewer && currentUserId && user.id === currentUserId) {
        setEditBranchIds([]);
        setEditRoleIds([]);
        return;
      }

      const [userBranches, userRoles] = await Promise.all([
        staffService.getUserBranches(user.id, token || undefined),
        staffService.getUserRoles(user.id, token || undefined),
      ]);

      if (user.userType === "SUPER_ADMIN") {
        setEditBranchIds([]);
        setEditRoleIds([]);
        return;
      }

      const branchIds = userBranches.map((b) => b.id);
      setEditBranchIds(
        user.userType === "WAITER" || user.userType === "EMPLOYEE"
          ? (branchIds[0] ? [branchIds[0]] : [])
          : branchIds
      );
      setEditRoleIds(
        user.userType === "WAITER"
          ? []
          : userRoles.map((r: any) => r.roleId || r.role?.id).filter(Boolean)
      );
    } catch (e) {
      console.error("Failed to load user RBAC details", e);
    }
  };

  const toggleInArray = (arr: string[], id: string) => {
    if (arr.includes(id)) return arr.filter((x) => x !== id);
    return [...arr, id];
  };

  const saveManage = async () => {
    if (!activeUser) return;

    try {
      setSaving(true);
      const token = await getToken();

      if (userType === "SUPER_ADMIN") {
        if (isLastOrgOwner(activeUser) && editOrgRole !== "ORG_OWNER") {
          toast.error(
            t("admin.staffManagement.lastOwnerRoleChangeBlocked", {
              defaultValue: "You can't change the organization role of the last ORG_OWNER",
            })
          );
          return;
        }
        await staffService.updateUserOrgRole(activeUser.id, editOrgRole, token || undefined);
        toast.success(t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }));
        setManageDialogOpen(false);
        setActiveUser(null);
        await loadData();
        return;
      }

      const isOrgContextEditor = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

      if (isOrgContextEditor && userType !== "SUPER_ADMIN") {
        // ORG_OWNER: can update orgRole for non-owner staff (but not self, and never demote last owner).
        if (orgRole === "ORG_OWNER") {
          if (currentUserId && activeUser.id === currentUserId) {
            toast.success(t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }));
            setManageDialogOpen(false);
            setActiveUser(null);
            return;
          }

          // ORG_OWNER must not promote another user to ORG_OWNER.
          if (activeUser.orgRole !== "ORG_OWNER" && editOrgRole === "ORG_OWNER") {
            toast.error(
              t("admin.staffManagement.ownerModifyOwnerBlocked", {
                defaultValue: "You can't modify another ORG_OWNER",
              })
            );
            return;
          }

          if (isLastOrgOwner(activeUser) && editOrgRole !== "ORG_OWNER") {
            toast.error(
              t("admin.staffManagement.lastOwnerRoleChangeBlocked", {
                defaultValue: "You can't change the organization role of the last ORG_OWNER",
              })
            );
            return;
          }

          await staffService.updateUserOrgRole(activeUser.id, editOrgRole, token || undefined);

          // Only when ORG_STAFF is selected: allow setting userType and branch/role assignments.
          if (editOrgRole === "ORG_STAFF") {
            if (editUserType === "BRANCH_ADMIN") {
              await Promise.all([
                staffService.updateUserType(activeUser.id, "BRANCH_ADMIN", token || undefined),
                staffService.setUserBranches(activeUser.id, editBranchIds, token || undefined),
              ]);
            } else {
              await Promise.all([
                staffService.updateUserType(activeUser.id, "EMPLOYEE", token || undefined),
                staffService.setUserBranches(activeUser.id, editBranchIds.slice(0, 1), token || undefined),
                staffService.setUserRoles(
                  activeUser.id,
                  editRoleIds.map((roleId) => ({ roleId, branchId: null })),
                  token || undefined
                ),
              ]);
            }
          }

          toast.success(t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }));
          setManageDialogOpen(false);
          setActiveUser(null);
          await loadData();
          return;
        }

        // ORG_ADMIN:
        // - can toggle orgRole between ORG_ADMIN/ORG_STAFF
        // - only when ORG_STAFF is selected: can set userType and branch/role assignments
        await staffService.updateUserOrgRole(activeUser.id, editOrgRole, token || undefined);

        if (editOrgRole === "ORG_ADMIN") {
          toast.success(t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }));
          setManageDialogOpen(false);
          setActiveUser(null);
          await loadData();
          return;
        }

        if (editUserType === "BRANCH_ADMIN") {
          await Promise.all([
            staffService.updateUserType(activeUser.id, editUserType, token || undefined),
            staffService.setUserBranches(activeUser.id, editBranchIds, token || undefined),
          ]);
        } else {
          // EMPLOYEE: single branch + role assignments
          await Promise.all([
            staffService.updateUserType(activeUser.id, "EMPLOYEE", token || undefined),
            staffService.setUserBranches(activeUser.id, editBranchIds.slice(0, 1), token || undefined),
            staffService.setUserRoles(
              activeUser.id,
              editRoleIds.map((roleId) => ({ roleId, branchId: null })),
              token || undefined
            ),
          ]);
        }

        toast.success(t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }));
        setManageDialogOpen(false);
        setActiveUser(null);
        await loadData();
        return;
      }

      if (isSuperAdminEdit) {
        await staffService.updateUserType(activeUser.id, editUserType, token || undefined);
      } else if (isWaiterEdit) {
        await Promise.all([
          staffService.updateUserType(activeUser.id, editUserType, token || undefined),
          staffService.setUserBranches(activeUser.id, editBranchIds.slice(0, 1), token || undefined),
        ]);
      } else if (editUserType === "BRANCH_ADMIN") {
        await Promise.all([
          staffService.updateUserType(activeUser.id, editUserType, token || undefined),
          staffService.setUserBranches(activeUser.id, editBranchIds, token || undefined),
        ]);
      } else {
        await Promise.all([
          staffService.updateUserType(activeUser.id, editUserType, token || undefined),
          staffService.setUserBranches(activeUser.id, editBranchIds.slice(0, 1), token || undefined),
          staffService.setUserRoles(
            activeUser.id,
            editRoleIds.map((roleId) => ({ roleId, branchId: null })),
            token || undefined
          ),
        ]);
      }

      await loadData();

      setManageDialogOpen(false);
      setActiveUser(null);
      toast.success(
        t("admin.staffManagement.savedSuccess", {
          defaultValue: "Saved successfully",
        })
      );
    } catch (e) {
      console.error("Failed to save staff user settings", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.staffManagement.title", { defaultValue: "Staff Management" })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.staffManagement.description", {
              defaultValue: "Manage staff users, their branch assignments, and roles.",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={openHireDialog}
            disabled={!canManageStaff}
            className="bg-background text-foreground border-border hover:bg-muted"
          >
            <Icon path={mdiPlus} size={0.67} className="mr-2" />
            {t("admin.staffManagement.hireStaff", { defaultValue: "Hire staff" })}
          </Button>
          <Button
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="bg-background text-foreground border-border hover:bg-muted"
          >
            <Icon path={mdiRefresh} size={0.67} className={loading ? "animate-spin mr-2" : "mr-2"} />
            {t("common.refresh", { defaultValue: "Refresh" })}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="space-y-4">
            <div className="relative">
              <Icon
                path={mdiMagnify}
                size={0.67}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder={t("admin.staffManagement.searchPlaceholder", {
                  defaultValue: "Search by name or email",
                })}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-transparent text-foreground border-border"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select
                value={selectedBranchId || "all"}
                onValueChange={(v: string) => setSelectedBranchId(v === "all" ? "" : v)}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.staffManagement.allBranches", {
                      defaultValue: "All branches",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.staffManagement.allBranches", { defaultValue: "All branches" })}
                  </SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedUserType || "all"}
                onValueChange={(v: string) => setSelectedUserType(v === "all" ? "" : v)}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.staffManagement.allStaffTypes", {
                      defaultValue: "All staff types",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.staffManagement.allStaffTypes", { defaultValue: "All staff types" })}
                  </SelectItem>
                  {USER_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant={includeInactive ? "default" : "outline"}
                onClick={() => setIncludeInactive((v) => !v)}
                className={includeInactive ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent border-border hover:bg-muted"}
              >
                {includeInactive
                  ? t("admin.staffManagement.includingInactive", { defaultValue: "Including inactive" })
                  : t("admin.staffManagement.activeOnly", { defaultValue: "Active only" })}
              </Button>

              <Button
                variant={assignedOnly ? "default" : "outline"}
                onClick={() => setAssignedOnly((v) => !v)}
                className={assignedOnly ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent border-border hover:bg-muted"}
              >
                {assignedOnly
                  ? t("admin.staffManagement.assignedOnly", { defaultValue: "Assigned only" })
                  : t("admin.staffManagement.showAll", { defaultValue: "Show all" })}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredStaff.map((u) => (
          <Card
            key={u.id}
            className={
              "p-3 hover:shadow-md transition-shadow " +
              (u.orgRole === "ORG_OWNER"
                ? "border border-amber-300/70"
                : u.orgRole === "ORG_ADMIN"
                ? "border border-blue-300/70"
                : "")
            }
          >
            <div className="space-y-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon path={mdiAccountGroup} size={0.7} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">
                    {`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}
                  </span>
                  {getOrgRoleBadge(u.orgRole) && (
                    <span
                      className={
                        "shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded " +
                        (getOrgRoleBadge(u.orgRole) as any).className
                      }
                    >
                      {(getOrgRoleBadge(u.orgRole) as any).label}
                    </span>
                  )}
                </div>

                <div className="text-xs text-muted-foreground truncate mt-1">{u.email}</div>
                {u.orgRole === "ORG_OWNER" || u.orgRole === "ORG_ADMIN" ? (
                  <div className="text-xs text-muted-foreground mt-1">
                    {t("admin.staffManagement.allBranchesAccess", {
                      defaultValue: "All branches access",
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground mt-1">
                    {t("admin.staffManagement.assignedBranchesCount", {
                      defaultValue: "Assigned branches: {{count}}",
                      count: u.assignedBranchesCount ?? 0,
                    })}
                  </div>
                )}

                {!u.orgRole && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {u.userType === "SUPER_ADMIN" ? (
                      <span className="inline-flex items-center gap-1">
                        <Icon path={mdiShieldCheck} size={0.5} /> Super Admin
                      </span>
                    ) : u.userType === "BRANCH_ADMIN" ? (
                      <span className="inline-flex items-center gap-1">
                        <Icon path={mdiShield} size={0.5} /> Branch Admin
                      </span>
                    ) : (
                      <span>{u.userType}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-transparent border-border hover:bg-muted"
                  onClick={() => openManage(u)}
                  disabled={
                    !canManageStaff ||
                    (orgRole === "ORG_ADMIN" && u.orgRole === "ORG_OWNER") ||
                    (orgRole === "ORG_OWNER" && isLastOrgOwner(u))
                  }
                >
                  {t("common.manage", { defaultValue: "Manage" })}
                </Button>

                {canRemoveFromOrg(u) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent border-border hover:bg-muted"
                    onClick={() => {
                      if (isLastOrgOwner(u)) return;
                      setRemoveTarget(u);
                      setRemoveDialogOpen(true);
                    }}
                    disabled={isLastOrgOwner(u)}
                  >
                    {t("admin.staffManagement.removeFromOrg", { defaultValue: "Remove" })}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("admin.staffManagement.manageDialogTitle", { defaultValue: "Manage Staff" })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {t("admin.staffManagement.orgRole", { defaultValue: "Organization Role" })}
              </div>
              <Select
                value={editOrgRole}
                onValueChange={(next: OrgRole) => {
                  setEditOrgRole(next);

                  // When ORG_ADMIN switches to ORG_ADMIN, disable staff-type editing.
                  if (isOrgAdminViewer && next === "ORG_ADMIN") {
                    setEditBranchIds([]);
                    setEditRoleIds([]);
                  }
                  if (isOrgAdminViewer && next === "ORG_STAFF") {
                    setEditUserType((prev) => (prev === "BRANCH_ADMIN" ? "BRANCH_ADMIN" : "EMPLOYEE"));
                  }

                  // When ORG_OWNER switches to ORG_ADMIN/ORG_OWNER, disable staff-type editing.
                  if (isOrgOwnerViewer && next !== "ORG_STAFF") {
                    setEditBranchIds([]);
                    setEditRoleIds([]);
                  }
                  if (isOrgOwnerViewer && next === "ORG_STAFF") {
                    setEditUserType((prev) => (prev === "BRANCH_ADMIN" ? "BRANCH_ADMIN" : "EMPLOYEE"));
                  }
                }}
                disabled={
                  userType === "SUPER_ADMIN"
                    ? isLastOrgOwner(activeUser as any)
                    : orgRole === "ORG_OWNER"
                    ? (Boolean(currentUserId) && activeUser?.id === currentUserId) ||
                      isLastOrgOwner(activeUser as any)
                    : activeUser?.orgRole === "ORG_OWNER"
                }
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orgRole === "ORG_OWNER" ? (
                    <>
                      {activeUser?.orgRole === "ORG_OWNER" && (
                        <SelectItem value="ORG_OWNER">ORG_OWNER</SelectItem>
                      )}
                      <SelectItem value="ORG_ADMIN">ORG_ADMIN</SelectItem>
                      <SelectItem value="ORG_STAFF">ORG_STAFF</SelectItem>
                    </>
                  ) : orgRole === "ORG_ADMIN" ? (
                    <>
                      <SelectItem value="ORG_ADMIN">ORG_ADMIN</SelectItem>
                      <SelectItem value="ORG_STAFF">ORG_STAFF</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="ORG_OWNER">ORG_OWNER</SelectItem>
                      <SelectItem value="ORG_ADMIN">ORG_ADMIN</SelectItem>
                      <SelectItem value="ORG_STAFF">ORG_STAFF</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>

              {(userType === "SUPER_ADMIN" || orgRole === "ORG_OWNER") && activeUser && isLastOrgOwner(activeUser) && (
                <div className="text-xs text-muted-foreground">
                  {t("admin.staffManagement.lastOwnerRoleChangeHint", {
                    defaultValue:
                      "This user is the only ORG_OWNER in the organization. Assign another owner before changing this role.",
                  })}
                </div>
              )}
            </div>

            {(orgRole === "ORG_ADMIN" || orgRole === "ORG_OWNER") &&
              editOrgRole === "ORG_STAFF" &&
              (!currentUserId || activeUser?.id !== currentUserId) && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t("admin.staffManagement.userType", { defaultValue: "User Type" })}
                  </div>
                  <Select
                    value={editUserType}
                    onValueChange={(next: UserType) => {
                      const normalized = next === "BRANCH_ADMIN" ? "BRANCH_ADMIN" : "EMPLOYEE";
                      setEditUserType(normalized);
                      if (normalized === "BRANCH_ADMIN") {
                        setEditRoleIds([]);
                      } else {
                        setEditBranchIds((prev) => (prev[0] ? [prev[0]] : []));
                      }
                    }}
                  >
                    <SelectTrigger className="bg-transparent text-foreground border-border">
                      <SelectValue
                        placeholder={t("admin.staffManagement.selectType", {
                          defaultValue: "Select type",
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMPLOYEE">Employee</SelectItem>
                      <SelectItem value="BRANCH_ADMIN">Branch Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

            {userType !== "SUPER_ADMIN" &&
              (orgRole !== "ORG_OWNER" || editOrgRole === "ORG_STAFF") &&
              (!currentUserId || activeUser?.id !== currentUserId) && (
                <>
                  {orgRole === "ORG_ADMIN" && editOrgRole !== "ORG_STAFF" ? null : (
                    <>
                      {isWaiterEdit && (
                        <div className="space-y-2">
                          <div className="text-sm font-medium">
                            {t("common.branch", { defaultValue: "Branch" })}
                          </div>
                          <Select
                            value={editBranchIds[0] || ""}
                            onValueChange={(v: string) => setEditBranchIds(v ? [v] : [])}
                          >
                            <SelectTrigger className="bg-transparent text-foreground border-border">
                              <SelectValue
                                placeholder={t("admin.staffManagement.selectBranch", {
                                  defaultValue: "Select branch",
                                })}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {branches.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {isEmployeeEdit && (
                        <div className="space-y-2">
                          <div className="text-sm font-medium">
                            {t("common.branch", { defaultValue: "Branch" })}
                          </div>
                          <Select
                            value={editBranchIds[0] || ""}
                            onValueChange={(v: string) => setEditBranchIds(v ? [v] : [])}
                          >
                            <SelectTrigger className="bg-transparent text-foreground border-border">
                              <SelectValue
                                placeholder={t("admin.staffManagement.selectBranch", {
                                  defaultValue: "Select branch",
                                })}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {branches.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {canEditBranchesMulti && (
                        <div className="space-y-2">
                          <div className="text-sm font-medium">
                            {t("admin.staffManagement.branches", { defaultValue: "Branches" })}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {branches.map((b) => (
                              <label key={b.id} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={editBranchIds.includes(b.id)}
                                  onCheckedChange={() => setEditBranchIds((prev) => toggleInArray(prev, b.id))}
                                />
                                <span className="truncate">{b.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {canEditRoles && (
                        <div className="space-y-2">
                          <div className="text-sm font-medium">
                            {t("admin.staffManagement.roles", { defaultValue: "Roles" })}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {roles.map((r) => (
                              <label key={r.id} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={editRoleIds.includes(r.id)}
                                  onCheckedChange={() => setEditRoleIds((prev) => toggleInArray(prev, r.id))}
                                />
                                <span className="truncate">{r.name}</span>
                              </label>
                            ))}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t("admin.staffManagement.rolesAssignedGloballyNote", {
                              defaultValue: "Roles are currently assigned globally (not per-branch) in this UI.",
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
          </div>

          <DialogFooter>
            <Button
              onClick={saveManage}
              disabled={saving || !activeUser}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              {saving
                ? t("common.saving", { defaultValue: "Saving..." })
                : t("common.save", { defaultValue: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("admin.staffManagement.removeFromOrg", { defaultValue: "Remove" })}
            </DialogTitle>
          </DialogHeader>

          <div className="text-sm text-muted-foreground">
            {t("admin.staffManagement.removeFromOrgConfirm", {
              defaultValue: "Are you sure you want to remove this user from the organization?",
            })}
          </div>

          {removeTarget && (
            <div className="text-sm font-medium text-foreground">
              {`${removeTarget.firstName || ""} ${removeTarget.lastName || ""}`.trim() ||
                removeTarget.email}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              className="bg-transparent border-border hover:bg-muted"
              onClick={() => setRemoveDialogOpen(false)}
              disabled={removing}
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              className="bg-pink-500 hover:bg-pink-600 text-white"
              onClick={confirmRemoveFromOrg}
              disabled={removing || !removeTarget || (removeTarget ? isLastOrgOwner(removeTarget) : false)}
            >
              {removing
                ? t("common.removing", { defaultValue: "Removing..." })
                : t("common.confirm", { defaultValue: "Confirm" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={hireDialogOpen} onOpenChange={setHireDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("admin.staffManagement.hireDialogTitle", { defaultValue: "Hire staff" })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                {t("admin.staffManagement.hireEmailLabel", { defaultValue: "Email" })}
              </label>
              <Input
                value={hireEmail}
                onChange={(e) => setHireEmail(e.target.value)}
                placeholder={t("admin.staffManagement.hireEmailPlaceholder", {
                  defaultValue: "Type full email address",
                })}
                className="bg-transparent text-foreground border-border"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setHireDialogOpen(false)}
                className="bg-transparent border-border hover:bg-muted"
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                type="button"
                onClick={searchHireCandidate}
                disabled={hireSearching || !hireEmail.trim()}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {hireSearching
                  ? t("common.loading", { defaultValue: "Loading" })
                  : t("admin.staffManagement.hireSearch", { defaultValue: "Search" })}
              </Button>
            </div>

            {hireCandidate && (
              <Card className="border border-border">
                <CardContent className="p-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">
                      {`${hireCandidate.firstName || ""} ${hireCandidate.lastName || ""}`.trim() ||
                        hireCandidate.email}
                    </div>
                    <div className="text-xs text-muted-foreground">{hireCandidate.email}</div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                onClick={confirmHire}
                disabled={!hireCandidate || hireSaving}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {hireSaving
                  ? t("common.loading", { defaultValue: "Loading" })
                  : t("admin.staffManagement.hireConfirm", {
                      defaultValue: "Hire as org staff",
                    })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!loading && filteredStaff.length === 0 && (
        <div className="text-sm text-muted-foreground">
          {t("admin.staffManagement.noStaffFound", { defaultValue: "No staff users found." })}
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
