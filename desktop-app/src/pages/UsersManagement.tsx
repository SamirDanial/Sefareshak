import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import {
  mdiAccountCheck,
  mdiAccountOff,
  mdiAccountRemove,
  mdiCalendar,
  mdiCart,
  mdiChevronLeft,
  mdiChevronRight,
  mdiDotsVertical,
  mdiEmail,
  mdiLoading,
  mdiMagnify,
  mdiPhone,
  mdiRefresh,
  mdiShieldCheck,
  mdiSort,
} from "@mdi/js";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import branchService, { type Organization } from "@/services/branchService";
import { userService, type OrgRole, type User, type UserType } from "@/services/userService";
import { toast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";

const UsersManagement: React.FC = () => {
  const { getToken, userType } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuItemsLoading, setMenuItemsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserType, setSelectedUserType] = useState<string>("");
  const [sortBy, setSortBy] = useState<"name" | "email" | "createdAt" | "userType">(
    "createdAt"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [orgDialogUser, setOrgDialogUser] = useState<User | null>(null);
  const [editOrganizationId, setEditOrganizationId] = useState<string>("");
  const [editOrgRole, setEditOrgRole] = useState<OrgRole>("ORG_STAFF");

  const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
  const ORG_CHANGED_EVENT = "bellami:organizationChanged";
  const [orgVersion, setOrgVersion] = useState(0);

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

      setUsers([]);
      setSearchTerm("");
      setSelectedUserType("");
      setSortBy("createdAt");
      setSortOrder("desc");
      setCurrentPage(1);
      setTotalPages(1);
      setTotalCount(0);
      setOrgDialogOpen(false);
      setOrgDialogUser(null);
      setEditOrganizationId("");
      setEditOrgRole("ORG_STAFF");
      setOrganizations([]);

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

  // Load data for non-search operations
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, selectedUserType, sortBy, sortOrder, orgVersion]);

  // Debounced search effect - only updates list overlay
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadSearchResults();
    }, 300);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (token && organizations.length === 0) {
        try {
          const orgs = await branchService.getOrganizations(token);
          setOrganizations(orgs);
        } catch {
          // ignore
        }
      }
      const response = await userService.getUsers(
        currentPage,
        10,
        searchTerm,
        sortBy,
        sortOrder,
        selectedUserType,
        token || undefined
      );

      setUsers(response.users);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadSearchResults = async () => {
    try {
      setMenuItemsLoading(true);
      const token = await getToken();
      const response = await userService.getUsers(
        currentPage,
        10,
        searchTerm,
        sortBy,
        sortOrder,
        selectedUserType,
        token || undefined
      );

      setUsers(response.users);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error loading search results:", error);
    } finally {
      setMenuItemsLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleUserTypeFilter = (userType: string) => {
    setSelectedUserType(userType === "all" ? "" : userType);
    setCurrentPage(1);
  };

  const handleMakeOrdinaryUser = async (user: User) => {
    try {
      setIsActionLoading(user.id);
      const token = await getToken();
      await userService.setUserOrganization(
        user.id,
        { organizationId: null, orgRole: null },
        token || undefined
      );
      await loadData();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.error ||
        (error as any)?.message ||
        "Failed to change user to ordinary";
      toast.error(message);
      console.error("Error changing user to ordinary:", error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      setIsActionLoading(user.id);
      const token = await getToken();
      await userService.toggleUserStatus(user.id, token || undefined);
      await loadData();
    } catch (error) {
      console.error("Error toggling user status:", error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const openOrgDialog = (user: User) => {
    setOrgDialogUser(user);
    setEditOrganizationId(user.organizationId || "");
    setEditOrgRole((user.orgRole as OrgRole) || "ORG_STAFF");
    setOrgDialogOpen(true);
  };

  const saveOrgDialog = async () => {
    if (!orgDialogUser) return;
    try {
      setIsActionLoading(orgDialogUser.id);
      const token = await getToken();
      await userService.setUserOrganization(
        orgDialogUser.id,
        {
          organizationId: editOrganizationId ? editOrganizationId : null,
          orgRole: editOrganizationId ? editOrgRole : null,
        },
        token || undefined
      );
      setOrgDialogOpen(false);
      setOrgDialogUser(null);
      await loadData();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.error ||
        (error as any)?.message ||
        "Failed to update user organization";

      const normalized = String(message)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

      if (
        normalized.includes("cannot remove") &&
        normalized.includes("last org_owner")
      ) {
        toast.error(
          t("admin.userManagement.lastOrgOwnerError", {
            defaultValue:
              "Cannot remove the last ORG_OWNER from an organization. Assign another ORG_OWNER first.",
          })
        );
      } else {
        toast.error(String(message));
      }

      console.error("Error updating user organization:", error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const getUserDisplayName = (user: User): string => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) {
      return user.firstName;
    }
    return user.email.split("@")[0];
  };

  const getUserInitials = (user: User): string => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.firstName) {
      return user.firstName[0].toUpperCase();
    }
    return user.email[0].toUpperCase();
  };

  const getUserTypeLabel = (userType: UserType): string => {
    const map: Record<UserType, string> = {
      SUPER_ADMIN: "Super Admin",
      BRANCH_ADMIN: "Branch Admin",
      EMPLOYEE: "Employee",
      WAITER: "Waiter",
      USER: "User",
    };
    return map[userType] || userType;
  };

  const handleSort = (field: "name" | "email" | "createdAt" | "userType") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "createdAt" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const getAvatarColor = (seed: string) => {
    const colors = [
      "#ec4899",
      "#f97316",
      "#eab308",
      "#22c55e",
      "#06b6d4",
      "#3b82f6",
      "#8b5cf6",
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      // eslint-disable-next-line no-bitwise
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % colors.length;
    return colors[idx];
  };

  const sortByLabelKey = useMemo(() => {
    // existing translations have `admin.userManagement.sortBy`, use that by default
    return "admin.userManagement.sortBy";
  }, []);

  const isSuperAdmin = userType === "SUPER_ADMIN";

  const isOnlyOrgOwnerForSelectedUser = useMemo(() => {
    if (!orgDialogUser) return false;
    if (orgDialogUser.orgRole !== "ORG_OWNER") return false;
    const orgId = String(orgDialogUser.organizationId || "");
    if (!orgId) return false;
    const owners = (users || []).filter(
      (u) => u && u.organizationId === orgId && u.orgRole === "ORG_OWNER"
    );
    return owners.length === 1 && owners[0]?.id === orgDialogUser.id;
  }, [orgDialogUser, users]);

  const isLastOwnerChangeBlocked = useMemo(() => {
    if (!orgDialogUser) return false;
    if (!isOnlyOrgOwnerForSelectedUser) return false;

    const originalOrgId = String(orgDialogUser.organizationId || "");
    const nextOrgId = String(editOrganizationId || "");
    const orgChanged = originalOrgId !== nextOrgId;
    const roleChangedAwayFromOwner = editOrgRole !== "ORG_OWNER";
    return orgChanged || roleChangedAwayFromOwner;
  }, [orgDialogUser, editOrganizationId, editOrgRole, isOnlyOrgOwnerForSelectedUser]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <PageHeader
            title={t("admin.userManagement.title")}
            description={t("admin.userManagement.description")}
            actions={
              <div className="flex items-center gap-2">
                <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-600" />
                <span className="text-sm text-gray-600">{t("admin.userManagement.loading")}</span>
              </div>
            }
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
          <div className="space-y-4">
            <div className="relative">
              <Icon
                path={mdiMagnify}
                size={0.67}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <Input
                placeholder={t("admin.userManagement.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2} className="animate-spin text-pink-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t("admin.userManagement.loadingTitle")}
            </h3>
            <p className="text-sm text-gray-600">{t("admin.userManagement.loadingDescription")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("common.accessDenied", { defaultValue: "Access denied" })}
          </h3>
          <p className="text-sm text-gray-600">
            {t("admin.userManagement.superAdminOnly", {
              defaultValue: "User Management is available to Super Admins only.",
            })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={t("admin.userManagement.title")}
        description={t("admin.userManagement.description")}
      />

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <div className="space-y-4">
          <div className="relative">
            <Icon
              path={mdiMagnify}
              size={0.67}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              placeholder={t("admin.userManagement.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
            <Select value={selectedUserType || "all"} onValueChange={handleUserTypeFilter}>
              <SelectTrigger className="bg-white shadow-sm">
                <SelectValue placeholder={t("admin.userManagement.allRoles")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.userManagement.allRoles")}</SelectItem>
                <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                <SelectItem value="BRANCH_ADMIN">Branch Admin</SelectItem>
                <SelectItem value="EMPLOYEE">Employee</SelectItem>
                <SelectItem value="WAITER">Waiter</SelectItem>
                <SelectItem value="USER">User</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-600">{t(sortByLabelKey, { defaultValue: "Sort by" })}</span>
            <Button
              variant={sortBy === "name" ? "default" : "outline"}
              size="sm"
              onClick={() => handleSort("name")}
              className={sortBy === "name" ? "bg-pink-600 hover:bg-pink-700 text-white" : ""}
            >
              <span>{t("admin.userManagement.sortName", { defaultValue: "Name" })}</span>
              {sortBy === "name" ? (
                <Icon path={mdiSort} size={0.5} className={`ml-2 ${sortOrder === "desc" ? "rotate-180" : ""}`} />
              ) : null}
            </Button>
            <Button
              variant={sortBy === "email" ? "default" : "outline"}
              size="sm"
              onClick={() => handleSort("email")}
              className={sortBy === "email" ? "bg-pink-600 hover:bg-pink-700 text-white" : ""}
            >
              <span>{t("admin.userManagement.sortEmail", { defaultValue: "Email" })}</span>
              {sortBy === "email" ? (
                <Icon path={mdiSort} size={0.5} className={`ml-2 ${sortOrder === "desc" ? "rotate-180" : ""}`} />
              ) : null}
            </Button>
            <Button
              variant={sortBy === "createdAt" ? "default" : "outline"}
              size="sm"
              onClick={() => handleSort("createdAt")}
              className={sortBy === "createdAt" ? "bg-pink-600 hover:bg-pink-700 text-white" : ""}
            >
              <span>{t("admin.userManagement.sortDate", { defaultValue: "Date" })}</span>
              {sortBy === "createdAt" ? (
                <Icon path={mdiSort} size={0.5} className={`ml-2 ${sortOrder === "asc" ? "rotate-180" : ""}`} />
              ) : null}
            </Button>
          </div>
        </div>
      </div>

      <div className="relative">
        {menuItemsLoading ? (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
            <div className="flex items-center gap-2 text-pink-600">
              <Icon path={mdiLoading} size={0.83} className="animate-spin" />
              <span className="text-sm font-medium">
                {t("admin.userManagement.searchingUsers")}
              </span>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {users.map((user) => (
            <div key={user.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
                  style={{ backgroundColor: getAvatarColor(user.id) }}
                >
                  {getUserInitials(user)}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 truncate">{getUserDisplayName(user)}</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 text-gray-900 rounded">
                      {(user.userType === "SUPER_ADMIN" || user.userType === "BRANCH_ADMIN") ? (
                        <Icon path={mdiShieldCheck} size={0.4} />
                      ) : null}
                      {getUserTypeLabel(user.userType)}
                    </span>
                    <span
                      className={
                        user.isActive
                          ? "px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700"
                          : "px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700"
                      }
                    >
                      {user.isActive ? t("admin.userManagement.active") : t("admin.userManagement.inactive")}
                    </span>
                    {user.orgRole ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">
                        {String(user.orgRole)}
                      </span>
                    ) : null}
                  </div>

                  {user.organization ? (
                    <div className="text-xs text-gray-500">{user.organization.name}</div>
                  ) : null}

                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Icon path={mdiEmail} size={0.4} className="shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>

                  {user.phone ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Icon path={mdiPhone} size={0.4} className="shrink-0" />
                      <span>{user.phone}</span>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <Icon path={mdiCalendar} size={0.4} className="shrink-0" />
                      <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon path={mdiCart} size={0.4} className="shrink-0" />
                      <span>
                        {user._count?.orders || 0} {t("admin.userManagement.orders")}
                      </span>
                    </div>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
                      <Icon path={mdiDotsVertical} size={0.6} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openOrgDialog(user)} disabled={isActionLoading === user.id}>
                      {t("admin.userManagement.assignOrganization", { defaultValue: "Assign organization" })}
                    </DropdownMenuItem>
                    {user.organizationId ? (
                      <DropdownMenuItem onClick={() => handleMakeOrdinaryUser(user)} disabled={isActionLoading === user.id}>
                        <Icon path={mdiAccountRemove} size={0.67} className="mr-2" />
                        {t("admin.userManagement.changeToOrdinary", { defaultValue: "Change to ordinary user" })}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => handleToggleStatus(user)} disabled={isActionLoading === user.id}>
                      {user.isActive ? (
                        <>
                          <Icon path={mdiAccountOff} size={0.67} className="mr-2" />
                          {t("admin.userManagement.deactivate")}
                        </>
                      ) : (
                        <>
                          <Icon path={mdiAccountCheck} size={0.67} className="mr-2" />
                          {t("admin.userManagement.activate")}
                        </>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("admin.userManagement.assignOrganization", { defaultValue: "Assign organization" })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {isOnlyOrgOwnerForSelectedUser ? (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                {t("admin.userManagement.lastOrgOwnerHint", {
                  defaultValue:
                    "This user is the only ORG_OWNER for this organization. Assign another ORG_OWNER first before changing their organization role or organization.",
                })}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>
                {t("admin.userManagement.organization", { defaultValue: "Organization" })}
              </Label>
              <Select
                value={editOrganizationId || "none"}
                onValueChange={(val) => setEditOrganizationId(val === "none" ? "" : val)}
              >
                <SelectTrigger className="bg-white border-gray-200">
                  <SelectValue
                    placeholder={t("admin.userManagement.selectOrganization", { defaultValue: "Select organization" })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t("admin.userManagement.noOrganization", { defaultValue: "No organization" })}
                  </SelectItem>
                  {organizations.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                {t("admin.userManagement.orgRole", { defaultValue: "Organization role" })}
              </Label>
              <Select
                value={editOrgRole}
                onValueChange={(val) => setEditOrgRole(val as OrgRole)}
                disabled={!editOrganizationId || isOnlyOrgOwnerForSelectedUser}
              >
                <SelectTrigger className="bg-white border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORG_OWNER">ORG_OWNER</SelectItem>
                  <SelectItem value="ORG_ADMIN">ORG_ADMIN</SelectItem>
                  <SelectItem value="ORG_STAFF">ORG_STAFF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOrgDialogOpen(false);
                setOrgDialogUser(null);
              }}
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={saveOrgDialog}
              disabled={!orgDialogUser || isActionLoading === orgDialogUser?.id || isLastOwnerChangeBlocked}
              className="bg-pink-600 hover:bg-pink-700 text-white"
            >
              {t("common.save", { defaultValue: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {t("admin.userManagement.showingUsers", { count: users.length, total: totalCount })}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>
              <Icon path={mdiChevronLeft} size={0.67} />
              {t("common.previous", { defaultValue: "Previous" })}
            </Button>
            <span className="text-sm text-gray-600">
              {t("admin.userManagement.pageOf", { current: currentPage, total: totalPages })}
            </span>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}>
              {t("common.next", { defaultValue: "Next" })}
              <Icon path={mdiChevronRight} size={0.67} />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default UsersManagement;

