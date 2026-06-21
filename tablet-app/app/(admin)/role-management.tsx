import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import {
  staffService,
  type PermissionResourcesResponse,
  type RoleUpsertInput,
  type StaffRole,
} from "@/src/services/staffService";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

type PermissionModule = {
  key: string;
  resource: string;
  title: string;
};

const normalizePermissionSet = (input: any): Record<string, string[]> => {
  if (!input) return {};

  let value = input;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (value && typeof value === "object" && value.permissions && typeof value.permissions === "object") {
    value = value.permissions;
  }

  if (Array.isArray(value)) {
    const out: Record<string, string[]> = {};
    for (const item of value) {
      if (!item) continue;
      const resource = item.resource;
      if (!resource || typeof resource !== "string") continue;
      if (typeof item.action === "string") {
        out[resource] = Array.from(new Set([...(out[resource] || []), item.action]));
      }
      if (Array.isArray(item.actions)) {
        const actions = item.actions.filter((a: any) => typeof a === "string");
        out[resource] = Array.from(new Set([...(out[resource] || []), ...actions]));
      }
    }
    return out;
  }

  if (value && typeof value === "object") {
    const out: Record<string, string[]> = {};
    for (const [resource, actionsValue] of Object.entries(value)) {
      if (!resource) continue;
      if (Array.isArray(actionsValue)) {
        out[resource] = actionsValue.filter((a) => typeof a === "string");
        continue;
      }
      if (typeof actionsValue === "string") {
        out[resource] = [actionsValue];
        continue;
      }
      if (actionsValue && typeof actionsValue === "object" && Array.isArray((actionsValue as any).actions)) {
        out[resource] = (actionsValue as any).actions.filter((a: any) => typeof a === "string");
        continue;
      }

      if (actionsValue && typeof actionsValue === "object") {
        const entries = Object.entries(actionsValue as Record<string, unknown>);
        const enabled = entries
          .filter(([, v]) => v === true)
          .map(([k]) => k)
          .filter((k) => typeof k === "string" && k.length > 0);
        if (enabled.length > 0) {
          out[resource] = enabled;
          continue;
        }
      }
    }
    return out;
  }

  return {};
};

const PERMISSION_MODULES: PermissionModule[] = [
  { key: "dashboard", resource: "dashboard", title: "admin.dashboard.title" },
  { key: "dispatch", resource: "dispatch", title: "admin.dispatch.title" },
  { key: "kitchen", resource: "kitchen", title: "admin.kitchen.title" },
  { key: "bar", resource: "bar", title: "admin.bar.title" },
  { key: "orders", resource: "orders", title: "admin.orderManagement.title" },
  { key: "pos", resource: "pos", title: "admin.pos.title" },
  { key: "menu", resource: "menu", title: "admin.menuManagement.title" },
  { key: "deals", resource: "deals", title: "admin.dealManagement.title" },
  { key: "categories", resource: "categories", title: "admin.categoryManagement.title" },
  { key: "addons", resource: "addons", title: "admin.addonManagement.title" },
  { key: "declarations", resource: "declarations", title: "admin.declarationManagement.title" },
  { key: "optional_ingredients", resource: "optional_ingredients", title: "admin.optionalIngredientManagement.title" },
  { key: "reservations", resource: "reservations", title: "admin.reservationManagement.title" },
  { key: "tables", resource: "tables", title: "admin.tableManagement.title" },
  { key: "zones", resource: "zones", title: "admin.zoneManagement.title" },
  { key: "table_status_grid", resource: "table_status_grid", title: "admin.tableStatusGrid.title" },
  { key: "branches", resource: "branches", title: "admin.branchManagement.title" },
  { key: "deliverable_quantities", resource: "deliverable_quantities", title: "admin.deliverableQuantities.title" },
  { key: "end_of_day", resource: "end_of_day", title: "admin.businessDay.endOfDayTitle" },
  { key: "closed_days", resource: "closed_days", title: "admin.businessDayClosedDays.title" },
  { key: "hero_sections", resource: "hero_sections", title: "admin.heroSection.title" },
  { key: "analytics_revenue", resource: "analytics_revenue", title: "admin.analytics.title" },
  { key: "analytics_category_insights", resource: "analytics_category_insights", title: "admin.categoryInsights.title" },
  { key: "analytics_reservation", resource: "analytics_reservation", title: "admin.reservationAnalytics.title" },
];

export default function RoleManagementScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { getToken } = useAuthRole();
  const { can, refreshPermissions } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);

  const permissionModules = useMemo<PermissionModule[]>(
    () =>
      PERMISSION_MODULES.map((m) => ({
        ...m,
        title: t(m.title as any, { defaultValue: m.resource }),
      })),
    [t]
  );

  const resourceDisplayName = (resource: string) => {
    if (resource === "dashboard") return t("admin.dashboard.title", { defaultValue: "Dashboard" });
    if (resource === "dispatch") return t("admin.dispatch.title", { defaultValue: "Dispatch" });
    if (resource === "kitchen") return t("admin.kitchen.title", { defaultValue: "Kitchen" });
    if (resource === "bar") return t("admin.bar.title", { defaultValue: "Bar" });
    if (resource === "orders") return t("admin.orderManagement.title", { defaultValue: "Order Management" });
    if (resource === "pos") return t("admin.pos.title", { defaultValue: "POS" });
    if (resource === "menu") return t("admin.menuManagement.title", { defaultValue: "Menu Management" });
    if (resource === "deals") return t("admin.dealManagement.title", { defaultValue: "Deal Management" });
    if (resource === "categories") return t("admin.categoryManagement.title", { defaultValue: "Category Management" });
    if (resource === "optional_ingredients") {
      return t("admin.optionalIngredientManagement.title", { defaultValue: "Optional Ingredients Management" });
    }
    if (resource === "addons") return t("admin.addonManagement.title", { defaultValue: "Addon Management" });
    if (resource === "declarations") return t("admin.declarationManagement.title", { defaultValue: "Declaration Management" });
    if (resource === "reservations") {
      return t("admin.reservationManagement.title", { defaultValue: "Reservation Management" });
    }
    if (resource === "zones") return t("admin.zoneManagement.title", { defaultValue: "Zone Management" });
    if (resource === "tables") return t("admin.tableManagement.title", { defaultValue: "Table Management" });
    if (resource === "branches") return t("admin.branchManagement.title", { defaultValue: "Branch Management" });
    if (resource === "settings") return t("admin.settings.title", { defaultValue: "Settings" });
    if (resource === "deliverable_quantities") {
      return t("admin.deliverableQuantities.title", { defaultValue: "Deliverable Quantities" });
    }
    if (resource === "users") return t("admin.userManagement.title", { defaultValue: "User Management" });
    if (resource === "roles") return t("admin.roleManagement.title", { defaultValue: "Role Management" });
    if (resource === "end_of_day") return t("admin.businessDay.endOfDayTitle", { defaultValue: "End of Day" });
    if (resource === "closed_days") return t("admin.businessDayClosedDays.title", { defaultValue: "Closed Days" });
    if (resource === "analytics") return t("admin.analytics.title", { defaultValue: "Analytics" });
    if (resource === "analytics_revenue") return t("admin.analytics.title", { defaultValue: "Revenue Analytics" });
    if (resource === "analytics_category_insights") return t("admin.categoryInsights.title", { defaultValue: "Category Insights" });
    if (resource === "analytics_reservation") return t("admin.reservationAnalytics.title", { defaultValue: "Reservation Analytics" });
    if (resource === "notifications") return t("admin.notifications.title", { defaultValue: "Notifications" });
    if (resource === "push_notifications") return t("admin.pushNotifications.title", { defaultValue: "Push Notifications" });
    if (resource === "hero_sections") return t("admin.heroSection.title", { defaultValue: "Hero Sections" });
    if (resource === "policies") return t("admin.termsAndPolicies.title", { defaultValue: "Terms & Policies" });
    return resource;
  };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [permissionMeta, setPermissionMeta] = useState<PermissionResourcesResponse | null>(null);

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [activeRole, setActiveRole] = useState<StaffRole | null>(null);

  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [roleIsActive, setRoleIsActive] = useState(true);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});

  const [roleSearch, setRoleSearch] = useState("");
  const [roleStatusFilter, setRoleStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showStatusFilterModal, setShowStatusFilterModal] = useState(false);
  const [permissionModuleSearch, setPermissionModuleSearch] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<StaffRole | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "success",
  });

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

  const MENU_CHILD_RESOURCES = ["categories", "addons", "declarations", "optional_ingredients"] as const;

  const addPermissionToSet = (perms: Record<string, string[]>, resource: string, action: string) => {
    const current = Array.isArray(perms[resource]) ? perms[resource] : [];
    if (!current.includes(action)) {
      perms[resource] = [...current, action];
    }
  };

  const applyPermissionDependencies = (perms: Record<string, string[]>, resource: string, action: string) => {
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

      if (a !== "view") {
        addIfAllowed(r, "view");
      }

      if (r === "menu" && a === "view") {
        for (const child of MENU_CHILD_RESOURCES) {
          if (isActionAllowed(child, a)) {
            addIfAllowed(child, a);
            walk(child, a);
          }
        }
      }

      if (a === "view" && MENU_CHILD_RESOURCES.includes(r as any)) {
        addIfAllowed("menu", "view");
      }

      if (r === "tables" && a === "view") {
        addIfAllowed("zones", "view");
      }

      if (r === "reservations") {
        addIfAllowed("zones", "view");
        addIfAllowed("tables", "view");
      }

      if (r === "zones" && a === "edit_floor_plan") {
        addIfAllowed("zones", "view_floor_plan");
      }
    };

    walk(resource, action);
  };

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);

    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection("down");
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection("up");
    }

    lastScrollY.current = currentScrollY;
  };

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
      setToast({
        visible: true,
        message: t("admin.roleManagement.loadError", { defaultValue: "Failed to load roles" }),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (organizationLoading) return;
    setRoleDialogOpen(false);
    setActiveRole(null);
    setPermissionModuleSearch("");
    setShowDeleteConfirm(false);
    setRoleToDelete(null);
    refreshPermissions();
    loadData();
  }, [selectedOrganizationId, organizationLoading, refreshPermissions]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const openCreateRole = () => {
    setActiveRole(null);
    setRoleName("");
    setRoleDescription("");
    setRoleIsActive(true);
    setRolePermissions({});
    setPermissionModuleSearch("");
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: StaffRole) => {
    setActiveRole(role);
    setRoleName(role.name || "");
    setRoleDescription(role.description || "");
    setRoleIsActive((role.isActive ?? true) === true);
    setRolePermissions(normalizePermissionSet(role.permissions));
    setPermissionModuleSearch("");
    setRoleDialogOpen(true);
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

      if (!isRemoving) {
        applyPermissionDependencies(updated, resource, action);
      }

      return updated;
    });
  };

  const sanitizeRolePermissions = (input: Record<string, string[]>) => {
    const next: Record<string, string[]> = { ...input };

    if ((next as any).reports) {
      const legacy = Array.isArray((next as any).reports) ? (next as any).reports : [];
      const legacyEndOfDay = legacy.map((a: any) => (a === "export" ? "close_day" : a));
      const existingEndOfDay = Array.isArray(next.end_of_day) ? next.end_of_day : [];
      const existingClosedDays = Array.isArray(next.closed_days) ? next.closed_days : [];

      next.end_of_day = Array.from(new Set([...existingEndOfDay, ...legacyEndOfDay]));
      next.closed_days = Array.from(new Set([...existingClosedDays, ...legacy]));
      delete (next as any).reports;
    }

    if ((next as any).meals) {
      delete (next as any).meals;
    }

    return next;
  };

  const saveRole = async () => {
    if (!roleName.trim()) {
      setToast({
        visible: true,
        message: t("admin.roleManagement.nameRequired", { defaultValue: "Role name is required" }),
        type: "error",
      });
      return;
    }

    try {
      setRoleSaving(true);
      const token = await getToken();

      const effectivePermissions: Record<string, string[]> = sanitizeRolePermissions({ ...rolePermissions });
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

      if (activeRole) {
        await staffService.updateRole(activeRole.id, payload, token || undefined);
      } else {
        await staffService.createRole(payload, token || undefined);
      }

      await loadData();
      setRoleDialogOpen(false);
      setActiveRole(null);
      setToast({
        visible: true,
        message: activeRole
          ? t("admin.roleManagement.roleUpdated", { defaultValue: "Role updated successfully" })
          : t("admin.roleManagement.roleCreated", { defaultValue: "Role created successfully" }),
        type: "success",
      });
    } catch (e) {
      console.error("Failed to save role", e);
      setToast({
        visible: true,
        message: t("admin.roleManagement.saveError", { defaultValue: "Failed to save role" }),
        type: "error",
      });
    } finally {
      setRoleSaving(false);
    }
  };

  const confirmDeleteRole = (role: StaffRole) => {
    setRoleToDelete(role);
    setShowDeleteConfirm(true);
  };

  const deleteRole = async () => {
    if (!roleToDelete) return;

    if (!can(RESOURCES.ROLES, ACTIONS.DELETE)) {
      setToast({
        visible: true,
        message: t("common.accessDenied", { defaultValue: "Access is denied" }),
        type: "error",
      });
      return;
    }

    try {
      setDeleting(true);
      const token = await getToken();
      await staffService.deleteRole(roleToDelete.id, token || undefined);
      await loadData();
      setShowDeleteConfirm(false);
      setRoleToDelete(null);
      setToast({
        visible: true,
        message: t("admin.roleManagement.roleDeleted", { defaultValue: "Role deleted successfully" }),
        type: "success",
      });
    } catch (e) {
      console.error("Failed to delete role", e);
      setToast({
        visible: true,
        message: t("admin.roleManagement.deleteError", { defaultValue: "Failed to delete role" }),
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading && roles.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("admin.roleManagement.loading", { defaultValue: "Loading roles..." })}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#f3f4f6"
          />
        }
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>{t("admin.roleManagement.title", { defaultValue: "Role Management" })}</Text>
          <Text style={styles.pageSubtitle}>{t("admin.roleManagement.description", { defaultValue: "Create roles and configure their permissions." })}</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.addButton} onPress={openCreateRole}>
            <MaterialCommunityIcons name="plus" size={18} color="#fff" />
            <Text style={styles.addButtonText}>{t("admin.roleManagement.createRole", { defaultValue: "Create Role" })}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowFilters((prev) => !prev)} style={styles.filterTextButtonContainer}>
            <Text style={styles.filterTextButton}>
              {showFilters
                ? t("admin.roleManagement.hideFilters", { defaultValue: "Hide Filters" })
                : t("admin.roleManagement.showFilters", { defaultValue: "Show Filters" })}
            </Text>
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filtersContainer}>
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder={t("admin.roleManagement.searchPlaceholder", { defaultValue: "Search roles..." })}
                placeholderTextColor="#6B7280"
                value={roleSearch}
                onChangeText={setRoleSearch}
              />
            </View>

            <TouchableOpacity
              style={[styles.filterDropdown, roleStatusFilter !== "all" && styles.filterDropdownActive]}
              onPress={() => setShowStatusFilterModal(true)}
            >
              <MaterialCommunityIcons name="filter-variant" size={14} color="#9CA3AF" />
              <Text style={styles.filterDropdownText}>
                {roleStatusFilter === "all"
                  ? t("admin.roleManagement.allStatuses", { defaultValue: "All statuses" })
                  : roleStatusFilter === "active"
                  ? t("admin.roleManagement.activeOnly", { defaultValue: "Active only" })
                  : t("admin.roleManagement.inactiveOnly", { defaultValue: "Inactive only" })}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        )}

        {filteredRoles.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="shield-account" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>{t("admin.roleManagement.empty", { defaultValue: "No roles found." })}</Text>
          </View>
        ) : (
          <View style={[styles.rolesGrid, isTablet && styles.rolesGridTablet]}>
            {filteredRoles.map((role) => {
              const isActive = (role.isActive ?? true) === true;
              const permissions = normalizePermissionSet(role.permissions);
              const permissionCount = Object.values(permissions).reduce((acc, actions) => acc + (actions?.length || 0), 0);

              return (
                <View key={role.id} style={[styles.roleCard, isTablet && styles.roleCardTablet]}>
                  <View style={styles.roleCardHeader}>
                    <View style={styles.roleInfo}>
                      <View style={styles.roleIconContainer}>
                        <MaterialCommunityIcons name="shield-account" size={18} color="#ec4899" />
                      </View>
                      <View style={styles.roleDetails}>
                        <View style={styles.roleNameRow}>
                          <Text style={styles.roleName}>{role.name || "-"}</Text>
                          <View style={[styles.statusBadge, isActive ? styles.statusBadgeActive : styles.statusBadgeInactive]}>
                            <Text style={[styles.statusBadgeText, isActive ? styles.statusBadgeTextActive : styles.statusBadgeTextInactive]}>
                              {isActive ? t("admin.roleManagement.active", { defaultValue: "Active" }) : t("admin.roleManagement.inactive", { defaultValue: "Inactive" })}
                            </Text>
                          </View>
                        </View>
                        {role.description ? <Text style={styles.roleDescription}>{role.description}</Text> : null}
                        <Text style={styles.permissionCount}>
                          {t("admin.roleManagement.permissionsCount", { defaultValue: "{{count}} permissions", count: permissionCount })}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.roleActions}>
                      <TouchableOpacity style={styles.editButton} onPress={() => openEditRole(role)}>
                        <MaterialCommunityIcons name="pencil" size={16} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDeleteRole(role)}>
                        <MaterialCommunityIcons name="trash-can" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={roleDialogOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          setRoleDialogOpen(false);
          setActiveRole(null);
          setPermissionModuleSearch("");
        }}
      >
        <View style={styles.sheetOverlay} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => {
              setRoleDialogOpen(false);
              setActiveRole(null);
              setPermissionModuleSearch("");
            }}
          />

          <View style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>
                {activeRole
                  ? t("admin.roleManagement.editRole", { defaultValue: "Edit Role" })
                  : t("admin.roleManagement.createRole", { defaultValue: "Create Role" })}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setRoleDialogOpen(false);
                  setActiveRole(null);
                  setPermissionModuleSearch("");
                }}
              >
                <MaterialCommunityIcons name="close" size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetBody}
              contentContainerStyle={styles.sheetBodyContent}
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              nestedScrollEnabled
            >
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t("admin.roleManagement.roleName", { defaultValue: "Role Name" })}</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder={t("admin.roleManagement.roleNamePlaceholder", { defaultValue: "Enter role name" })}
                  placeholderTextColor="#6B7280"
                  value={roleName}
                  onChangeText={setRoleName}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t("admin.roleManagement.description", { defaultValue: "Description" })}</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder={t("admin.roleManagement.descriptionPlaceholder", { defaultValue: "Enter description (optional)" })}
                  placeholderTextColor="#6B7280"
                  value={roleDescription}
                  onChangeText={setRoleDescription}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.formGroup}>
                <TouchableOpacity style={styles.checkboxItem} onPress={() => setRoleIsActive((v) => !v)}>
                  <MaterialCommunityIcons
                    name={roleIsActive ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={20}
                    color={roleIsActive ? "#ec4899" : "#9CA3AF"}
                  />
                  <Text style={styles.checkboxLabel}>{t("admin.roleManagement.isActive", { defaultValue: "Role is active" })}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t("admin.roleManagement.permissions", { defaultValue: "Permissions" })}</Text>

                <View style={styles.permissionSearchContainer}>
                  <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                  <TextInput
                    style={styles.permissionSearchInput}
                    placeholder={t("admin.roleManagement.searchModulesPlaceholder", { defaultValue: "Search modules..." })}
                    placeholderTextColor="#6B7280"
                    value={permissionModuleSearch}
                    onChangeText={setPermissionModuleSearch}
                  />
                </View>

                {filteredPermissionModules.map((module) => (
                  <View key={module.key} style={styles.permissionModule}>
                    <Text style={styles.permissionModuleTitle}>{module.title}</Text>
                    <View style={styles.permissionActions}>
                      {module.actions
                        .filter((action) => {
                          if (
                            (module.resource === "dispatch" || module.resource === "kitchen" || module.resource === "bar") &&
                            action !== "view" &&
                            action !== "edit"
                          ) {
                            return false;
                          }
                          if (module.resource === "orders" && (action === "create" || action === "delete" || action === "update_status")) {
                            return false;
                          }
                          if (module.resource === "reservations" && (action === "create" || action === "delete")) {
                            return false;
                          }
                          return true;
                        })
                        .map((action) => (
                          <TouchableOpacity
                            key={action}
                            style={[
                              styles.permissionChip,
                              rolePermissions[module.resource]?.includes(action) && styles.permissionChipActive,
                            ]}
                            onPress={() => toggleRolePermission(module.resource, action)}
                          >
                            <Text
                              style={[
                                styles.permissionChipText,
                                rolePermissions[module.resource]?.includes(action) && styles.permissionChipTextActive,
                              ]}
                            >
                              {action}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity
                style={[styles.saveButton, roleSaving && styles.saveButtonDisabled]}
                onPress={saveRole}
                disabled={roleSaving}
              >
                {roleSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {activeRole ? t("common.save", { defaultValue: "Save" }) : t("common.create", { defaultValue: "Create" })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showStatusFilterModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowStatusFilterModal(false)}
      >
        <View style={styles.sheetOverlay} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowStatusFilterModal(false)} />

          <View style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{t("admin.roleManagement.filterByStatus", { defaultValue: "Filter by Status" })}</Text>
              <View style={{ gap: 10 }}>
                {(["all", "active", "inactive"] as const).map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[styles.sheetItem, roleStatusFilter === status && styles.sheetItemActive]}
                    onPress={() => {
                      setRoleStatusFilter(status);
                      setShowStatusFilterModal(false);
                    }}
                  >
                    <Text style={[styles.sheetItemText, roleStatusFilter === status && styles.sheetItemTextActive]}>
                      {status === "all"
                        ? t("admin.roleManagement.allStatuses", { defaultValue: "All statuses" })
                        : status === "active"
                        ? t("admin.roleManagement.activeOnly", { defaultValue: "Active only" })
                        : t("admin.roleManagement.inactiveOnly", { defaultValue: "Inactive only" })}
                    </Text>
                    {roleStatusFilter === status && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowStatusFilterModal(false)}>
                <Text style={styles.sheetCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <Pressable style={styles.deleteModalOverlay} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable style={styles.deleteModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.deleteModalTitle}>{t("admin.roleManagement.deleteRoleTitle", { defaultValue: "Delete Role" })}</Text>
            <Text style={styles.deleteModalDescription}>
              {t("admin.roleManagement.deleteRoleDescription", {
                defaultValue: `Are you sure you want to delete "${roleToDelete?.name}"? This action cannot be undone.`,
                name: roleToDelete?.name,
              })}
            </Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowDeleteConfirm(false)}>
                <Text style={styles.cancelButtonText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteButton, deleting && styles.confirmDeleteButtonDisabled]}
                onPress={deleteRole}
                disabled={deleting}
              >
                {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmDeleteButtonText}>{t("common.delete", { defaultValue: "Delete" })}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
        topOffset={16}
      />

      <RefreshSpinner visible={refreshing} topOffset={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  pageHeader: {
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
  },
  headerActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  filterTextButtonContainer: {
    alignSelf: "flex-end",
  },
  filterTextButton: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
    textDecorationLine: "underline",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ec4899",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  filtersContainer: {
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
  },
  filterDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  rolesGrid: {
    flexDirection: "column",
  },
  rolesGridTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  roleCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  roleCardTablet: {
    width: "48%",
  },
  roleCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  roleInfo: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
  },
  roleIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(236, 72, 153, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  roleDetails: {
    flex: 1,
    gap: 4,
  },
  roleNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  roleName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeActive: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
  },
  statusBadgeInactive: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  statusBadgeTextActive: {
    color: "#22c55e",
  },
  statusBadgeTextInactive: {
    color: "#ef4444",
  },
  roleDescription: {
    fontSize: 13,
    color: "#6B7280",
  },
  permissionCount: {
    fontSize: 12,
    color: "#6B7280",
  },
  roleActions: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    height: "85%",
    maxHeight: "90%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    marginBottom: 12,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  sheetBody: {
    flex: 1,
  },
  sheetBodyContent: {
    paddingBottom: 8,
  },
  sheetFooter: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  checkboxItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  checkboxLabel: {
    fontSize: 14,
    color: "#374151",
  },
  permissionModule: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  permissionModuleTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  permissionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  permissionSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  permissionSearchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
  },
  permissionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  permissionChipActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  permissionChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  permissionChipTextActive: {
    color: "#fff",
  },
  saveButton: {
    backgroundColor: "#ec4899",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  sheetContent: {
    paddingBottom: 12,
  },
  sheetScrollView: {
    maxHeight: 420,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 10,
  },
  sheetItemActive: {
    borderColor: "#ec4899",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
    flex: 1,
  },
  sheetItemTextActive: {
    color: "#111827",
    fontWeight: "600",
  },
  sheetCancel: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    alignItems: "center",
    marginTop: 6,
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  deleteModalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 520,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  deleteModalDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    marginBottom: 24,
  },
  deleteModalButtons: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  confirmDeleteButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    backgroundColor: "#ef4444",
  },
  confirmDeleteButtonDisabled: {
    opacity: 0.6,
  },
  confirmDeleteButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
