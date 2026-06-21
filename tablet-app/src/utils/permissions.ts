export const USER_TYPES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  BRANCH_ADMIN: "BRANCH_ADMIN",
  EMPLOYEE: "EMPLOYEE",
  WAITER: "WAITER",
  USER: "USER",
} as const;

export type UserType = keyof typeof USER_TYPES;

export const RESOURCES = {
  DASHBOARD: "dashboard",
  ORDERS: "orders",
  DISPATCH: "dispatch",
  KITCHEN: "kitchen",
  BAR: "bar",
  RESERVATIONS: "reservations",
  MENU: "menu",
  DEALS: "deals",
  CATEGORIES: "categories",
  MEALS: "meals",
  ADDONS: "addons",
  OPTIONAL_INGREDIENTS: "optional_ingredients",
  DECLARATIONS: "declarations",
  BRANCHES: "branches",
  SETTINGS: "settings",
  DELIVERABLE_QUANTITIES: "deliverable_quantities",
  USERS: "users",
  ROLES: "roles",
  REPORTS: "reports",
  POS: "pos",

  END_OF_DAY: "end_of_day",
  CLOSED_DAYS: "closed_days",

  ANALYTICS: "analytics",
  ANALYTICS_REVENUE: "analytics_revenue",
  ANALYTICS_CATEGORY_INSIGHTS: "analytics_category_insights",
  ANALYTICS_RESERVATION: "analytics_reservation",
  NOTIFICATIONS: "notifications",
  PUSH_NOTIFICATIONS: "push_notifications",
  HERO_SECTIONS: "hero_sections",
  POLICIES: "policies",
  TABLES: "tables",
  TABLE_STATUS_GRID: "table_status_grid",
  ZONES: "zones",
} as const;

export type Resource = (typeof RESOURCES)[keyof typeof RESOURCES];

export const ACTIONS = {
  VIEW: "view",
  EDIT: "edit",
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  VIEW_HISTORY: "view_history",
  VIEW_BRANCH_SETTINGS: "view_branch_settings",
  UPDATE_BRANCH_SETTINGS: "update_branch_settings",
  VIEW_BRANCH_RESERVATION_SETTINGS: "view_branch_reservation_settings",
  UPDATE_BRANCH_RESERVATION_SETTINGS: "update_branch_reservation_settings",
  CANCEL: "cancel",
  REFUND: "refund",
  UPDATE_STATUS: "update_status",
  REORDER_FEATURED: "reorder_featured",
  REORDER_CATEGORY: "reorder_category",
  ORDERING: "ordering",
  DISPLAY_PRIORITY: "display_priority",
  CONFIRM: "confirm",
  SEAT: "seat",
  COMPLETE: "complete",
  ASSIGN_ROLES: "assign_roles",
  ASSIGN_BRANCHES: "assign_branches",
  DEACTIVATE: "deactivate",
  MANAGE: "manage",
  EXPORT: "export",
  CLOSE_DAY: "close_day",
  SEND: "send",
  TOGGLE_ACTIVE: "toggle_active",
  VIEW_FLOOR_PLAN: "view_floor_plan",
  EDIT_FLOOR_PLAN: "edit_floor_plan",
  URGENT_CLOSE_BRANCH: "urgent_close_branch",
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

export type PermissionSet = {
  [key in Resource]?: Action[];
};

export interface RBACUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  userType: UserType;
  orgRole?: string | null;
  organizationId?: string | null;
  hasFullAccess: boolean;
  assignedBranchIds: string[];
  permissions: PermissionSet;
  roles: Array<{ id: string; name: string; branchId: string | null }>;
}

export function hasImplicitFullAccess(userType: UserType): boolean {
  return userType === USER_TYPES.SUPER_ADMIN;
}

export function hasPermission(
  user: RBACUser | null | undefined,
  resource: Resource,
  action: Action
): boolean {
  if (!user) return false;
  if (user.hasFullAccess || hasImplicitFullAccess(user.userType)) return true;
  const resourcePermissions = user.permissions?.[resource];
  if (!resourcePermissions) return false;
  return resourcePermissions.includes(action);
}

export function hasAnyPermission(
  user: RBACUser | null | undefined,
  permissions: Array<{ resource: Resource; action: Action }>
): boolean {
  if (!user) return false;
  if (user.hasFullAccess || hasImplicitFullAccess(user.userType)) return true;
  return permissions.some(({ resource, action }) => hasPermission(user, resource, action));
}

export function hasAllPermissions(
  user: RBACUser | null | undefined,
  permissions: Array<{ resource: Resource; action: Action }>
): boolean {
  if (!user) return false;
  if (user.hasFullAccess || hasImplicitFullAccess(user.userType)) return true;
  return permissions.every(({ resource, action }) => hasPermission(user, resource, action));
}

export function hasBranchAccess(
  user: RBACUser | null | undefined,
  branchId: string
): boolean {
  if (!user) return false;
  if (user.hasFullAccess || hasImplicitFullAccess(user.userType)) return true;
  return Array.isArray(user.assignedBranchIds) && user.assignedBranchIds.includes(branchId);
}

export function canPerformOnBranch(
  user: RBACUser | null | undefined,
  resource: Resource,
  action: Action,
  branchId: string
): boolean {
  return hasPermission(user, resource, action) && hasBranchAccess(user, branchId);
}
