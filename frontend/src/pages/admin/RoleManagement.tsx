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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import Icon from "@mdi/react";
import { mdiPlus, mdiPencil, mdiDeleteOutline, mdiRefresh, mdiMagnify } from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import {
  staffService,
  type StaffRole,
  type RoleUpsertInput,
  type PermissionResourcesResponse,
} from "@/services/staffService";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const RoleManagement: React.FC = () => {
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const { can } = usePermissions();

  type PermissionModule = {
    key: string;
    resource: string;
    title: string;
  };

  const permissionModules: PermissionModule[] = [
    { key: "dashboard", resource: "dashboard", title: t("admin.dashboard.title", { defaultValue: "Dashboard" }) },
    { key: "dispatch", resource: "dispatch", title: t("admin.dispatch.title", { defaultValue: "Dispatch" }) },
    { key: "kitchen", resource: "kitchen", title: t("admin.kitchen.title", { defaultValue: "Kitchen" }) },
    { key: "bar", resource: "bar", title: t("admin.bar.title", { defaultValue: "Bar" }) },
    { key: "orders", resource: "orders", title: t("admin.orderManagement.title", { defaultValue: "Order Management" }) },
    { key: "menu", resource: "menu", title: t("admin.menuManagement.title", { defaultValue: "Menu Management" }) },
    { key: "deals", resource: "deals", title: t("admin.dealManagement.title", { defaultValue: "Deal Management" }) },
    {
      key: "categories",
      resource: "categories",
      title: t("admin.categoryManagement.title", { defaultValue: "Category Management" }),
    },
    { key: "addons", resource: "addons", title: t("admin.addonManagement.title", { defaultValue: "Addon Management" }) },
    {
      key: "declarations",
      resource: "declarations",
      title: t("admin.declarationManagement.title", { defaultValue: "Declaration Management" }),
    },
    {
      key: "optional_ingredients",
      resource: "optional_ingredients",
      title: t("admin.optionalIngredientManagement.title", {
        defaultValue: "Optional Ingredients Management",
      }),
    },
    {
      key: "reservations",
      resource: "reservations",
      title: t("admin.reservationManagement.title", { defaultValue: "Reservation Management" }),
    },
    {
      key: "tables",
      resource: "tables",
      title: t("admin.tableManagement.title", { defaultValue: "Table Management" }),
    },
    {
      key: "zones",
      resource: "zones",
      title: t("admin.zoneManagement.title", { defaultValue: "Zone Management" }),
    },
    {
      key: "table_status_grid",
      resource: "table_status_grid",
      title: t("admin.tableStatusGrid.title", { defaultValue: "Table Status Grid" }),
    },
    {
      key: "branches",
      resource: "branches",
      title: t("admin.branchManagement.title", { defaultValue: "Branch Management" }),
    },
    {
      key: "deliverable_quantities",
      resource: "deliverable_quantities",
      title: t("admin.deliverableQuantities.title", { defaultValue: "Deliverable Quantities" }),
    },
    {
      key: "end_of_day",
      resource: "end_of_day",
      title: t("admin.businessDay.endOfDayTitle", { defaultValue: "End of Day" }),
    },
    {
      key: "closed_days",
      resource: "closed_days",
      title: t("admin.businessDayClosedDays.title", { defaultValue: "Closed Days" }),
    },
    {
      key: "hero_sections",
      resource: "hero_sections",
      title: t("admin.heroSection.title", { defaultValue: "Hero Sections" }),
    },
    {
      key: "analytics_revenue",
      resource: "analytics_revenue",
      title: t("admin.analytics.title", { defaultValue: "Revenue Analytics" }),
    },
    {
      key: "analytics_category_insights",
      resource: "analytics_category_insights",
      title: t("admin.categoryInsights.title", { defaultValue: "Category Insights" }),
    },
    {
      key: "analytics_reservation",
      resource: "analytics_reservation",
      title: t("admin.reservationAnalytics.title", { defaultValue: "Reservation Analytics" }),
    },
  ];

  const resourceDisplayName = (resource: string) => {
    if (resource === "dashboard") {
      return t("admin.dashboard.title", { defaultValue: "Dashboard" });
    }
    if (resource === "dispatch") {
      return t("admin.dispatch.title", { defaultValue: "Dispatch" });
    }
    if (resource === "kitchen") {
      return t("admin.kitchen.title", { defaultValue: "Kitchen" });
    }
    if (resource === "bar") {
      return t("admin.bar.title", { defaultValue: "Bar" });
    }
    if (resource === "orders") {
      return t("admin.orderManagement.title", { defaultValue: "Order Management" });
    }
    if (resource === "menu") {
      return t("admin.menuManagement.title", { defaultValue: "Menu Management" });
    }
    if (resource === "deals") {
      return t("admin.dealManagement.title", { defaultValue: "Deal Management" });
    }
    if (resource === "categories") {
      return t("admin.categoryManagement.title", { defaultValue: "Category Management" });
    }
    if (resource === "optional_ingredients") {
      return t("admin.optionalIngredientManagement.title", {
        defaultValue: "Optional Ingredients Management",
      });
    }
    if (resource === "addons") {
      return t("admin.addonManagement.title", { defaultValue: "Addon Management" });
    }
    if (resource === "declarations") {
      return t("admin.declarationManagement.title", { defaultValue: "Declaration Management" });
    }
    if (resource === "reservations") {
      return t("admin.reservationManagement.title", { defaultValue: "Reservation Management" });
    }
    if (resource === "zones") {
      return t("admin.zoneManagement.title", { defaultValue: "Zone Management" });
    }
    if (resource === "tables") {
      return t("admin.tableManagement.title", { defaultValue: "Table Management" });
    }
    if (resource === "branches") {
      return t("admin.branchManagement.title", { defaultValue: "Branch Management" });
    }
    if (resource === "settings") {
      return t("admin.settings.title", { defaultValue: "Settings" });
    }
    if (resource === "deliverable_quantities") {
      return t("admin.deliverableQuantities.title", { defaultValue: "Deliverable Quantities" });
    }
    if (resource === "users") {
      return t("admin.userManagement.title", { defaultValue: "User Management" });
    }
    if (resource === "roles") {
      return t("admin.roleManagement.title", { defaultValue: "Role Management" });
    }
    if (resource === "end_of_day") {
      return t("admin.businessDay.endOfDayTitle", { defaultValue: "End of Day" });
    }
    if (resource === "closed_days") {
      return t("admin.businessDayClosedDays.title", { defaultValue: "Closed Days" });
    }
    if (resource === "analytics") {
      return t("admin.analytics.title", { defaultValue: "Analytics" });
    }
    if (resource === "analytics_revenue") {
      return t("admin.analytics.title", { defaultValue: "Revenue Analytics" });
    }
    if (resource === "analytics_category_insights") {
      return t("admin.categoryInsights.title", { defaultValue: "Category Insights" });
    }
    if (resource === "analytics_reservation") {
      return t("admin.reservationAnalytics.title", { defaultValue: "Reservation Analytics" });
    }
    if (resource === "notifications") {
      return t("admin.notifications.title", { defaultValue: "Notifications" });
    }
    if (resource === "push_notifications") {
      return t("admin.pushNotifications.title", { defaultValue: "Push Notifications" });
    }
    if (resource === "hero_sections") {
      return t("admin.heroSection.title", { defaultValue: "Hero Sections" });
    }
    if (resource === "policies") {
      return t("admin.termsAndPolicies.title", { defaultValue: "Terms & Policies" });
    }
    return resource;
  };

  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [permissionMeta, setPermissionMeta] = useState<PermissionResourcesResponse | null>(null);

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [activeRole, setActiveRole] = useState<StaffRole | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffRole | null>(null);
  const [roleDeletingId, setRoleDeletingId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [roleIsActive, setRoleIsActive] = useState(true);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});

  const [roleSearch, setRoleSearch] = useState("");
  const [roleStatusFilter, setRoleStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [permissionModuleSearch, setPermissionModuleSearch] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      const token = await getToken();

      const [roleList, resources] = await Promise.all([
        staffService.getRoles(true, token || undefined),
        staffService.getPermissionResources(token || undefined),
      ]);

      setRoles(roleList);
      setPermissionMeta(resources);
    } catch (e) {
      console.error("Failed to load role management data", e);
    } finally {
      setLoading(false);
    }
  };

  const filteredRoles = useMemo(() => {
    const term = roleSearch.trim().toLowerCase();
    return roles
      .filter((r) => {
        const isActive = (r.isActive ?? true) === true;
        if (roleStatusFilter === "active" && !isActive) return false;
        if (roleStatusFilter === "inactive" && isActive) return false;
        if (!term) return true;

        const name = (r.name || "").toLowerCase();
        const desc = (r.description || "").toLowerCase();
        return name.includes(term) || desc.includes(term);
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [roles, roleSearch, roleStatusFilter]);

  const filteredPermissionModules = useMemo(() => {
    if (!permissionMeta) return [] as Array<PermissionModule & { actions: string[] }>;
    const term = permissionModuleSearch.trim().toLowerCase();

    const roleResources = new Set(Object.keys(rolePermissions || {}));

    const sortActions = (actions: string[]) => {
      const preferredOrder = ["view", "create", "update", "delete"];
      return [...actions].sort((a, b) => {
        const ai = preferredOrder.indexOf(a);
        const bi = preferredOrder.indexOf(b);

        const aPreferred = ai !== -1;
        const bPreferred = bi !== -1;

        if (aPreferred && bPreferred) return ai - bi;
        if (aPreferred) return -1;
        if (bPreferred) return 1;
        return a.localeCompare(b);
      });
    };

    const mergeActions = (resource: string, actions: string[]) => {
      const existing = Array.isArray(rolePermissions?.[resource]) ? rolePermissions[resource] : [];
      return sortActions(Array.from(new Set([...(actions || []), ...existing])));
    };

    const base = permissionModules
      .map((m) => ({
        ...m,
        actions: mergeActions(m.resource, permissionMeta.resourceActions?.[m.resource] ?? []),
      }))
      .filter((m) => m.actions.length > 0);

    const filtered = !term
      ? base
      : base.filter((m) => {
          const label = (m.title || "").toLowerCase();
          const resource = (m.resource || "").toLowerCase();
          const key = (m.key || "").toLowerCase();
          return label.includes(term) || resource.includes(term) || key.includes(term);
        });

    const includedResources = new Set(permissionModules.map((m) => m.resource));
    const hiddenResources = new Set([
      "users",
      "roles",
      "analytics",
      "meals",
      "settings",
      "push_notifications",
      "policies",
    ]);
    const extraResources = Object.entries(permissionMeta.resourceActions)
      .filter(([resource, actions]) => {
        if (includedResources.has(resource)) return false;
        if (resource === "meals") return false;
        if (hiddenResources.has(resource) && !roleResources.has(resource)) return false;
        if (!Array.isArray(actions) || actions.length === 0) return false;
        if (!term) return true;
        const display = resourceDisplayName(resource).toLowerCase();
        return resource.toLowerCase().includes(term) || display.includes(term);
      })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([resource, actions]) => ({
        key: `extra:${resource}`,
        resource,
        title: resourceDisplayName(resource),
        actions: mergeActions(resource, actions as string[]),
      }));

    const orphanRoleResources = Array.from(roleResources)
      .filter((resource) => !includedResources.has(resource) && !permissionMeta.resourceActions?.[resource])
      .filter((resource) => resource !== "meals")
      .filter((resource) => {
        if (!term) return true;
        const display = resourceDisplayName(resource).toLowerCase();
        return resource.toLowerCase().includes(term) || display.includes(term);
      })
      .sort((a, b) => a.localeCompare(b))
      .map((resource) => ({
        key: `orphan:${resource}`,
        resource,
        title: resourceDisplayName(resource),
        actions: mergeActions(resource, []),
      }))
      .filter((m) => m.actions.length > 0);

    return [...filtered, ...extraResources, ...orphanRoleResources];
  }, [permissionMeta, permissionModuleSearch, permissionModules, rolePermissions]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateRole = () => {
    setActiveRole(null);
    setRoleName("");
    setRoleDescription("");
    setRoleIsActive(true);
    setRolePermissions({});
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: StaffRole) => {
    setActiveRole(role);
    setRoleName(role.name || "");
    setRoleDescription(role.description || "");
    setRoleIsActive((role.isActive ?? true) === true);
    setRolePermissions((role.permissions as any) || {});
    setRoleDialogOpen(true);
  };

  const MENU_CHILD_RESOURCES = [
    "categories",
    "addons",
    "declarations",
    "optional_ingredients",
  ] as const;

  const addPermissionToSet = (
    perms: Record<string, string[]>,
    resource: string,
    action: string
  ) => {
    const current = Array.isArray(perms[resource]) ? perms[resource] : [];
    if (!current.includes(action)) {
      perms[resource] = [...current, action];
    }
  };

  const applyPermissionDependencies = (
    perms: Record<string, string[]>,
    resource: string,
    action: string
  ) => {
    const visited = new Set<string>();

    const isActionAllowed = (r: string, a: string) => {
      const allowed = permissionMeta?.resourceActions?.[r] ?? [];
      return Array.isArray(allowed) && allowed.includes(a);
    };

    const addIfAllowed = (r: string, a: string) => {
      if (!isActionAllowed(r, a)) return;
      addPermissionToSet(perms, r, a);
    };

    const walk = (r: string, a: string) => {
      const key = `${r}:${a}`;
      if (visited.has(key)) return;
      visited.add(key);

      // Generic rule: any non-view permission implies view on the same resource
      if (a !== "view") {
        addIfAllowed(r, "view");
      }

      // Menu module should only imply VIEW on its child resources.
      // Non-view actions (create/update/delete/toggle/etc.) should NOT auto-enable other modules.
      if (r === "menu" && a === "view") {
        for (const child of MENU_CHILD_RESOURCES) {
          if (isActionAllowed(child, a)) {
            addIfAllowed(child, a);
            walk(child, a);
          }
        }
      }

      // Child menu pages should imply MENU:view for practical navigation/UX,
      // but only when granting VIEW.
      if (a === "view" && MENU_CHILD_RESOURCES.includes(r as any)) {
        addIfAllowed("menu", "view");
      }

      // Tables UI relies on zones list/filtering; if tables are viewable, zones should be viewable.
      if (r === "tables" && a === "view") {
        addIfAllowed("zones", "view");
      }

      // Reservation Management relies on zones and tables (filters + assign table flows).
      // Any reservation permission should ensure the role can at least view zones and tables.
      if (r === "reservations") {
        addIfAllowed("zones", "view");
        addIfAllowed("tables", "view");
      }

      // Floor plan edit implies floor plan view (same resource)
      if (r === "zones" && a === "edit_floor_plan") {
        addIfAllowed("zones", "view_floor_plan");
      }
    };

    walk(resource, action);
  };

  const toggleRolePermission = (resource: string, action: string) => {
    setRolePermissions((prev) => {
      const current = Array.isArray(prev?.[resource]) ? prev[resource] : [];
      const isRemoving = current.includes(action);

      const next = isRemoving ? current.filter((a) => a !== action) : [...current, action];

      const updated: Record<string, string[]> = { ...prev, [resource]: next };
      if (updated[resource].length === 0) {
        delete updated[resource];
      }

      // Add-only dependency behavior: enabling a permission also enables its dependencies.
      // Disabling does not auto-remove dependencies to avoid surprising permission loss.
      if (!isRemoving) {
        applyPermissionDependencies(updated, resource, action);
      }

      return updated;
    });
  };

  const sanitizeRolePermissions = (input: Record<string, string[]>) => {
    const next: Record<string, string[]> = { ...input };

    // Migrate legacy combined reports permission into standalone permissions.
    // This keeps old roles working while moving toward the new model.
    if (next.reports) {
      const legacy = Array.isArray(next.reports) ? next.reports : [];
      const legacyEndOfDay = legacy.map((a) => (a === "export" ? "close_day" : a));
      const existingEndOfDay = Array.isArray(next.end_of_day) ? next.end_of_day : [];
      const existingClosedDays = Array.isArray(next.closed_days) ? next.closed_days : [];

      next.end_of_day = Array.from(new Set([...existingEndOfDay, ...legacyEndOfDay]));
      next.closed_days = Array.from(new Set([...existingClosedDays, ...legacy]));
      delete next.reports;
    }

    if (next.meals) {
      delete next.meals;
    }

    return next;
  };

  const saveRole = async () => {
    try {
      setRoleSaving(true);
      const token = await getToken();

      const effectivePermissions: Record<string, string[]> = sanitizeRolePermissions({
        ...rolePermissions,
      });
      const zonesActions = Array.isArray(effectivePermissions.zones) ? effectivePermissions.zones : [];
      if (zonesActions.length > 0) {
        const allowedTableActions = permissionMeta?.resourceActions?.tables ?? [];
        const existingTableActions = Array.isArray(effectivePermissions.tables) ? effectivePermissions.tables : [];
        const toMirror = zonesActions.filter((a) => allowedTableActions.includes(a));
        const merged = Array.from(new Set([...existingTableActions, ...toMirror]));
        if (merged.length > 0) {
          effectivePermissions.tables = merged;
        }
      }

      const payload: RoleUpsertInput = {
        name: roleName.trim(),
        description: roleDescription.trim() ? roleDescription.trim() : null,
        permissions: effectivePermissions,
        isActive: roleIsActive,
      };

      if (!payload.name) return;

      if (activeRole?.id) {
        await staffService.updateRole(activeRole.id, payload, token || undefined);
      } else {
        await staffService.createRole(payload, token || undefined);
      }

      setRoleDialogOpen(false);
      await loadData();
    } catch (e) {
      console.error("Failed to save role", e);
    } finally {
      setRoleSaving(false);
    }
  };

  const confirmDeleteRole = async (role: StaffRole) => {
    if (!role?.id) return;
    try {
      setRoleDeletingId(role.id);
      const token = await getToken();
      await staffService.deleteRole(role.id, token || undefined);
      toast.success(
        t("admin.roleManagement.deleteSuccess", {
          defaultValue: "Role deleted successfully",
        })
      );
      await loadData();
    } catch (e: any) {
      console.error("Failed to delete role", e);
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        t("admin.roleManagement.deleteFailed", { defaultValue: "Failed to delete role" });
      toast.error(msg);
    } finally {
      setRoleDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.roleManagement.title", { defaultValue: "Role Management" })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.roleManagement.description", {
              defaultValue: "Create roles and configure their permissions.",
            })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="bg-background text-foreground border-border hover:bg-muted"
          >
            <Icon path={mdiRefresh} size={0.67} className={loading ? "animate-spin mr-2" : "mr-2"} />
            {t("common.refresh", { defaultValue: "Refresh" })}
          </Button>

          <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="default"
                onClick={openCreateRole}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                <Icon path={mdiPlus} size={0.67} className="mr-2" />
                {t("admin.roleManagement.createRole", { defaultValue: "Create Role" })}
              </Button>
            </DialogTrigger>

            <DialogContent className="bg-card border-border text-foreground max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  {activeRole
                    ? t("admin.roleManagement.editRole", { defaultValue: "Edit Role" })
                    : t("admin.roleManagement.createRole", { defaultValue: "Create Role" })}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      {t("common.name", { defaultValue: "Name" })}
                    </div>
                    <Input
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      placeholder={t("admin.roleManagement.namePlaceholder", {
                        defaultValue: "e.g. Orders Operator",
                      })}
                      className="bg-transparent text-foreground border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      {t("common.status", { defaultValue: "Status" })}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={roleIsActive} onCheckedChange={() => setRoleIsActive((v) => !v)} />
                      <span>{t("common.active", { defaultValue: "Active" })}</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t("common.description", { defaultValue: "Description" })}
                  </div>
                  <Input
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    placeholder={t("common.optional", { defaultValue: "Optional" })}
                    className="bg-transparent text-foreground border-border"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t("admin.roleManagement.permissions", { defaultValue: "Permissions" })}
                  </div>
                  {!permissionMeta ? (
                    <div className="text-sm text-muted-foreground">
                      {t("admin.roleManagement.loadingPermissions", {
                        defaultValue: "Loading permission resources...",
                      })}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative">
                        <Icon
                          path={mdiMagnify}
                          size={0.67}
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                          value={permissionModuleSearch}
                          onChange={(e) => setPermissionModuleSearch(e.target.value)}
                          placeholder={t("admin.roleManagement.searchModulesPlaceholder", {
                            defaultValue: "Search modules...",
                          })}
                          className="pl-9 bg-transparent text-foreground border-border"
                        />
                      </div>

                      <div className="space-y-4 max-h-[52vh] overflow-auto pr-2">
                        {filteredPermissionModules.map((module) => (
                          <div key={module.key} className="border border-border rounded-lg p-3">
                            <div className="text-sm font-semibold text-foreground mb-2">{module.title}</div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              {((module.resource === "dispatch" ||
                                module.resource === "kitchen" ||
                                module.resource === "bar")
                                ? module.actions.filter((action) => action === "view" || action === "edit")
                                : module.resource === "orders"
                                ? module.actions.filter(
                                    (action) =>
                                      action !== "create" &&
                                      action !== "delete" &&
                                      action !== "update_status"
                                  )
                                : module.resource === "reservations"
                                ? module.actions.filter(
                                    (action) => action !== "create" && action !== "delete"
                                  )
                                : module.actions
                              ).map((action: string) => (
                                <label key={action} className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={(rolePermissions?.[module.resource] || []).includes(action)}
                                    onCheckedChange={() => toggleRolePermission(module.resource, action)}
                                  />
                                  <span className="truncate">{action}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  onClick={saveRole}
                  disabled={roleSaving || !roleName.trim()}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {roleSaving
                    ? t("common.saving", { defaultValue: "Saving..." })
                    : t("admin.roleManagement.saveRole", { defaultValue: "Save Role" })}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="relative">
              <Icon
                path={mdiMagnify}
                size={0.67}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder={t("admin.roleManagement.searchRolesPlaceholder", {
                  defaultValue: "Search roles...",
                })}
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                className="pl-9 bg-transparent text-foreground border-border"
              />
            </div>

            <Select
              value={roleStatusFilter}
              onValueChange={(v: string) => setRoleStatusFilter(v as any)}
            >
              <SelectTrigger className="bg-transparent text-foreground border-border">
                <SelectValue
                  placeholder={t("admin.roleManagement.filterStatusPlaceholder", {
                    defaultValue: "Filter by status",
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("common.all", { defaultValue: "All" })}
                </SelectItem>
                <SelectItem value="active">
                  {t("common.active", { defaultValue: "Active" })}
                </SelectItem>
                <SelectItem value="inactive">
                  {t("common.inactive", { defaultValue: "Inactive" })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredRoles.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{r.name}</div>
                  {r.description ? (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{r.description}</div>
                  ) : null}
                  {(r.isActive ?? true) === false ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      {t("common.inactive", { defaultValue: "Inactive" })}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent border-border hover:bg-muted"
                    onClick={() => openEditRole(r)}
                  >
                    <Icon path={mdiPencil} size={0.67} className="mr-1" />
                    {t("common.edit", { defaultValue: "Edit" })}
                  </Button>
                  <Dialog
                    open={deleteDialogOpen && deleteTarget?.id === r.id}
                    onOpenChange={(open) => {
                      if (!open) setDeleteTarget(null);
                      setDeleteDialogOpen(open);
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-transparent border-border hover:bg-muted"
                        disabled={roleDeletingId === r.id}
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Icon path={mdiDeleteOutline} size={0.67} className="mr-1" />
                        {t("common.delete", { defaultValue: "Delete" })}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border text-foreground max-w-md">
                      <DialogHeader>
                        <DialogTitle>
                          {t("admin.roleManagement.deleteRole", { defaultValue: "Delete role" })}
                        </DialogTitle>
                      </DialogHeader>

                      <div className="text-sm text-muted-foreground">
                        {t("admin.roleManagement.deleteRoleDescription", {
                          defaultValue:
                            "Are you sure you want to delete this role? This action cannot be undone.",
                        })}
                      </div>

                      <div className="text-sm font-medium text-foreground">{r.name}</div>

                      <DialogFooter>
                        <Button
                          variant="outline"
                          className="bg-transparent border-border hover:bg-muted"
                          onClick={() => setDeleteDialogOpen(false)}
                          disabled={roleDeletingId === r.id}
                        >
                          {t("common.cancel", { defaultValue: "Cancel" })}
                        </Button>
                        <Button
                          onClick={() => {
                            if (!can(RESOURCES.ROLES, ACTIONS.DELETE)) {
                              toast.error(
                                t("common.accessDenied", {
                                  defaultValue: "Access is denied",
                                })
                              );
                              return;
                            }
                            confirmDeleteRole(r);
                          }}
                          className="bg-red-600 hover:bg-red-700 text-white"
                          disabled={roleDeletingId === r.id}
                        >
                          {roleDeletingId === r.id
                            ? t("common.deleting", { defaultValue: "Deleting..." })
                            : t("common.delete", { defaultValue: "Delete" })}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            ))}

            {!loading && filteredRoles.length === 0 && (
              <div className="text-sm text-muted-foreground">
                {t("admin.roleManagement.noRolesFound", { defaultValue: "No roles found." })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
};

export default RoleManagement;
