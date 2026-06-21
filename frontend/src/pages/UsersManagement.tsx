import React, { useState, useEffect } from "react";
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
import Icon from "@mdi/react";
import { mdiMagnify, mdiDotsVertical, mdiChevronLeft, mdiChevronRight, mdiLoading, mdiEmail, mdiPhone, mdiCalendar, mdiCart, mdiRefresh, mdiSort, mdiShieldCheck, mdiAccountOff, mdiAccountCheck, mdiAccountRemove } from "@mdi/js";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { userService, type OrgRole, type User, type UserType } from "@/services/userService";
import { useTranslation } from "react-i18next";
import { getAvatarColor } from "@/utils/avatarColors";
import branchService, { type Organization } from "@/services/branchService";
import { toast } from "sonner";

const UsersManagement: React.FC = () => {
  const { getToken } = useAuth();
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

  // Load data for non-search operations
  useEffect(() => {
    loadData();
  }, [currentPage, selectedUserType, sortBy, sortOrder]);

  // Debounced search effect - only updates menu items
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadSearchResults();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
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
      console.error("Error updating user organization:", error);
    } finally {
      setIsActionLoading(null);
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

  // Event handlers
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleUserTypeFilter = (userType: string) => {
    setSelectedUserType(userType === "all" ? "" : userType);
    setCurrentPage(1);
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

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold text-pink-500">
              {t("admin.userManagement.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("admin.userManagement.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              {t("admin.userManagement.loading")}
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
                  placeholder={t("admin.userManagement.searchPlaceholder")}
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
                  value={selectedUserType || "all"}
                  onValueChange={(value: string) => handleUserTypeFilter(value)}
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue placeholder={t("admin.userManagement.allRoles")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("admin.userManagement.allRoles")}
                    </SelectItem>
                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                    <SelectItem value="BRANCH_ADMIN">Branch Admin</SelectItem>
                    <SelectItem value="EMPLOYEE">Employee</SelectItem>
                    <SelectItem value="WAITER">Waiter</SelectItem>
                    <SelectItem value="USER">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">{t("admin.userManagement.sortByLabel")}</span>
                <Button
                  variant={sortBy === "name" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSort("name")}
                  className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent border-border hover:bg-muted"}
                >
                  <span className={sortBy === "name" ? "text-white" : ""}>
                    {t("admin.userManagement.sortName")}
                  </span>
                  {sortBy === "name" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
                <Button
                  variant={sortBy === "email" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSort("email")}
                  className={sortBy === "email" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent border-border hover:bg-muted"}
                >
                  <span className={sortBy === "email" ? "text-white" : ""}>
                    {t("admin.userManagement.sortEmail")}
                  </span>
                  {sortBy === "email" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
                <Button
                  variant={sortBy === "createdAt" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSort("createdAt")}
                  className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent border-border hover:bg-muted"}
                >
                  <span className={sortBy === "createdAt" ? "text-white" : ""}>
                    {t("admin.userManagement.sortDate")}
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
              {t("admin.userManagement.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.userManagement.loadingDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.userManagement.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.userManagement.description")}
          </p>
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
                placeholder={t("admin.userManagement.searchPlaceholder")}
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
                value={selectedUserType || "all"}
                onValueChange={(value: string) => handleUserTypeFilter(value)}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue placeholder={t("admin.userManagement.allRoles")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin.userManagement.allRoles")}
                  </SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  <SelectItem value="BRANCH_ADMIN">Branch Admin</SelectItem>
                  <SelectItem value="EMPLOYEE">Employee</SelectItem>
                  <SelectItem value="WAITER">Waiter</SelectItem>
                  <SelectItem value="USER">User</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">{t("admin.userManagement.sortByLabel")}</span>
              <Button
                variant={sortBy === "name" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSort("name")}
                className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent border-border hover:bg-muted"}
              >
                <span className={sortBy === "name" ? "text-white" : ""}>
                  {t("admin.userManagement.sortName")}
                </span>
                {sortBy === "name" && (
                  <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                )}
              </Button>
              <Button
                variant={sortBy === "email" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSort("email")}
                className={sortBy === "email" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent border-border hover:bg-muted"}
              >
                <span className={sortBy === "email" ? "text-white" : ""}>
                  {t("admin.userManagement.sortEmail")}
                </span>
                {sortBy === "email" && (
                  <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                )}
              </Button>
              <Button
                variant={sortBy === "createdAt" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSort("createdAt")}
                className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent border-border hover:bg-muted"}
              >
                <span className={sortBy === "createdAt" ? "text-white" : ""}>
                  {t("admin.userManagement.sortDate")}
                </span>
                {sortBy === "createdAt" && (
                  <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Grid */}
      <div className="relative">
        {menuItemsLoading && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
            <div className="flex items-center gap-2 text-pink-500">
              <Icon path={mdiLoading} size={0.83} className="animate-spin" />
              <span className="text-sm font-medium">
                {t("admin.userManagement.searchingUsers")}
              </span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {users.map((user) => (
            <Card key={user.id} className="p-3 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
                  style={{ backgroundColor: getAvatarColor(user.id) }}
                >
                  {getUserInitials(user)}
                </div>

                {/* User Details */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Name + Badges Row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">
                      {getUserDisplayName(user)}
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 rounded">
                      {(user.userType === "SUPER_ADMIN" || user.userType === "BRANCH_ADMIN") && (
                        <Icon path={mdiShieldCheck} size={0.4} />
                      )}
                      {getUserTypeLabel(user.userType)}
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 text-[10px] font-medium rounded",
                        user.isActive
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}
                    >
                      {user.isActive
                        ? t("admin.userManagement.active")
                        : t("admin.userManagement.inactive")}
                    </span>
                    {user.orgRole && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                        {user.orgRole.replace("_", " ")}
                      </span>
                    )}
                  </div>

                  {/* Organization Row */}
                  {user.organization && (
                    <div className="text-xs text-muted-foreground">
                      {user.organization.name}
                    </div>
                  )}

                  {/* Email Row */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon path={mdiEmail} size={0.4} className="flex-shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>

                  {/* Phone Row (if exists) */}
                  {user.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon path={mdiPhone} size={0.4} className="flex-shrink-0" />
                      <span>{user.phone}</span>
                    </div>
                  )}

                  {/* Date + Orders Row */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Icon path={mdiCalendar} size={0.4} className="flex-shrink-0" />
                      <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon path={mdiCart} size={0.4} className="flex-shrink-0" />
                      <span>{user._count?.orders || 0} {t("admin.userManagement.orders")}</span>
                    </div>
                  </div>
                </div>

                {/* Actions Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 flex-shrink-0"
                    >
                      <Icon path={mdiDotsVertical} size={0.6} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => openOrgDialog(user)}
                      disabled={isActionLoading === user.id}
                    >
                      {t("admin.userManagement.assignOrganization", {
                        defaultValue: "Assign organization",
                      })}
                    </DropdownMenuItem>
                    {user.organizationId && (
                      <DropdownMenuItem
                        onClick={() => handleMakeOrdinaryUser(user)}
                        disabled={isActionLoading === user.id}
                      >
                        <Icon path={mdiAccountRemove} size={0.67} className="mr-2" />
                        {t("admin.userManagement.changeToOrdinary", {
                          defaultValue: "Change to ordinary user",
                        })}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleToggleStatus(user)}
                      disabled={isActionLoading === user.id}
                    >
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
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("admin.userManagement.assignOrganization", {
                defaultValue: "Assign organization",
              })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                {t("admin.userManagement.organization", {
                  defaultValue: "Organization",
                })}
              </Label>
              <Select
                value={editOrganizationId || "none"}
                onValueChange={(val) => setEditOrganizationId(val === "none" ? "" : val)}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.userManagement.selectOrganization", {
                      defaultValue: "Select organization",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t("admin.userManagement.noOrganization", {
                      defaultValue: "No organization",
                    })}
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
                {t("admin.userManagement.orgRole", {
                  defaultValue: "Organization role",
                })}
              </Label>
              <Select
                value={editOrgRole}
                onValueChange={(val) => setEditOrgRole(val as OrgRole)}
                disabled={!editOrganizationId}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
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
              className="bg-transparent border-border hover:bg-muted"
              onClick={() => {
                setOrgDialogOpen(false);
                setOrgDialogUser(null);
              }}
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={saveOrgDialog}
              disabled={!orgDialogUser || isActionLoading === orgDialogUser?.id}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              {t("common.save", { defaultValue: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("admin.userManagement.showingUsers", {
              count: users.length,
              total: totalCount,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:text-muted-foreground"
            >
              <Icon path={mdiChevronLeft} size={0.67} />
              {t("common.previous")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("admin.userManagement.pageOf", {
                current: currentPage,
                total: totalPages,
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:text-muted-foreground"
            >
              {t("common.next")}
              <Icon path={mdiChevronRight} size={0.67} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersManagement;
