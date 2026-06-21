/**
 * RBAC Permission System - Frontend
 * 
 * This file mirrors the backend permission definitions and provides
 * utilities for checking permissions on the frontend.
 * 
 * IMPORTANT: Frontend permission checks are for UI/UX only.
 * The backend ALWAYS validates permissions on every API request.
 */

// ==================== USER TYPES ====================
export const USER_TYPES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  BRANCH_ADMIN: 'BRANCH_ADMIN',
  EMPLOYEE: 'EMPLOYEE',
  WAITER: 'WAITER',
  USER: 'USER',
} as const;

export type UserType = keyof typeof USER_TYPES;

// ==================== RESOURCES ====================
export const RESOURCES = {
  DASHBOARD: 'dashboard',
  ORDERS: 'orders',
  DISPATCH: 'dispatch',
  KITCHEN: 'kitchen',
  BAR: 'bar',
  RESERVATIONS: 'reservations',
  MENU: 'menu',
  DEALS: 'deals',
  CATEGORIES: 'categories',
  MEALS: 'meals',
  ADDONS: 'addons',
  OPTIONAL_INGREDIENTS: 'optional_ingredients',
  DECLARATIONS: 'declarations',
  BRANCHES: 'branches',
  SETTINGS: 'settings',
  DELIVERABLE_QUANTITIES: 'deliverable_quantities',
  USERS: 'users',
  ROLES: 'roles',
  // Legacy combined reports resource (kept for backward compatibility)
  REPORTS: 'reports',

  // Business day reporting
  END_OF_DAY: 'end_of_day',
  CLOSED_DAYS: 'closed_days',

  ANALYTICS: 'analytics',
  ANALYTICS_REVENUE: 'analytics_revenue',
  ANALYTICS_CATEGORY_INSIGHTS: 'analytics_category_insights',
  ANALYTICS_RESERVATION: 'analytics_reservation',
  NOTIFICATIONS: 'notifications',
  PUSH_NOTIFICATIONS: 'push_notifications',
  HERO_SECTIONS: 'hero_sections',
  POLICIES: 'policies',
  TABLES: 'tables',
  TABLE_STATUS_GRID: 'table_status_grid',
  ZONES: 'zones',
} as const;

export type Resource = typeof RESOURCES[keyof typeof RESOURCES];

// ==================== ACTIONS ====================
export const ACTIONS = {
  VIEW: 'view',
  EDIT: 'edit',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  VIEW_HISTORY: 'view_history',
  VIEW_BRANCH_SETTINGS: 'view_branch_settings',
  UPDATE_BRANCH_SETTINGS: 'update_branch_settings',
  VIEW_BRANCH_RESERVATION_SETTINGS: 'view_branch_reservation_settings',
  UPDATE_BRANCH_RESERVATION_SETTINGS: 'update_branch_reservation_settings',
  CANCEL: 'cancel',
  REFUND: 'refund',
  UPDATE_STATUS: 'update_status',
  REORDER_FEATURED: 'reorder_featured',
  REORDER_CATEGORY: 'reorder_category',
  ORDERING: 'ordering',
  DISPLAY_PRIORITY: 'display_priority',
  CONFIRM: 'confirm',
  SEAT: 'seat',
  COMPLETE: 'complete',
  ASSIGN_ROLES: 'assign_roles',
  ASSIGN_BRANCHES: 'assign_branches',
  DEACTIVATE: 'deactivate',
  MANAGE: 'manage',
  EXPORT: 'export',
  CLOSE_DAY: 'close_day',
  SEND: 'send',
  TOGGLE_ACTIVE: 'toggle_active',

  // Floor plan permissions
  VIEW_FLOOR_PLAN: 'view_floor_plan',
  EDIT_FLOOR_PLAN: 'edit_floor_plan',
} as const;

export type Action = typeof ACTIONS[keyof typeof ACTIONS];

// ==================== PERMISSION TYPES ====================
export type PermissionSet = {
  [key in Resource]?: Action[];
};

export interface RBACUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  userType: UserType;
  hasFullAccess: boolean;
  organizationEntitlements?: {
    id: string;
    reservationsAllowed: boolean;
    onlinePaymentsAllowed?: boolean;
    cardPaymentsAllowed?: boolean;
    paypalAllowed?: boolean;
  } | null;
  assignedBranchIds: string[];
  permissions: PermissionSet;
  roles: Array<{
    id: string;
    name: string;
    branchId: string | null;
  }>;
}

// ==================== PERMISSION CHECKING ====================

/**
 * Check if user type has implicit full access
 */
export function hasImplicitFullAccess(userType: UserType): boolean {
  return userType === USER_TYPES.SUPER_ADMIN;
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  user: RBACUser | null | undefined,
  resource: Resource,
  action: Action
): boolean {
  if (!user) return false;
  
  // Super admin has all permissions
  if (user.hasFullAccess || hasImplicitFullAccess(user.userType)) {
    return true;
  }
  
  const resourcePermissions = user.permissions[resource];
  if (!resourcePermissions) return false;
  
  return resourcePermissions.includes(action);
}

/**
 * Check if user has ANY of the specified permissions
 */
export function hasAnyPermission(
  user: RBACUser | null | undefined,
  permissions: Array<{ resource: Resource; action: Action }>
): boolean {
  if (!user) return false;
  
  if (user.hasFullAccess || hasImplicitFullAccess(user.userType)) {
    return true;
  }
  
  return permissions.some(({ resource, action }) =>
    hasPermission(user, resource, action)
  );
}

/**
 * Check if user has ALL of the specified permissions
 */
export function hasAllPermissions(
  user: RBACUser | null | undefined,
  permissions: Array<{ resource: Resource; action: Action }>
): boolean {
  if (!user) return false;
  
  if (user.hasFullAccess || hasImplicitFullAccess(user.userType)) {
    return true;
  }
  
  return permissions.every(({ resource, action }) =>
    hasPermission(user, resource, action)
  );
}

/**
 * Check if user has access to a specific branch
 */
export function hasBranchAccess(
  user: RBACUser | null | undefined,
  branchId: string
): boolean {
  if (!user) return false;
  
  // Super admin has access to all branches
  if (user.hasFullAccess || hasImplicitFullAccess(user.userType)) {
    return true;
  }
  
  return user.assignedBranchIds.includes(branchId);
}

/**
 * Check if user can perform action on a specific branch
 */
export function canPerformOnBranch(
  user: RBACUser | null | undefined,
  resource: Resource,
  action: Action,
  branchId: string
): boolean {
  return hasPermission(user, resource, action) && hasBranchAccess(user, branchId);
}

/**
 * Get all permissions for a resource
 */
export function getResourcePermissions(
  user: RBACUser | null | undefined,
  resource: Resource
): Action[] {
  if (!user) return [];
  
  if (user.hasFullAccess || hasImplicitFullAccess(user.userType)) {
    return Object.values(ACTIONS);
  }
  
  return user.permissions[resource] || [];
}

/**
 * Check if user is at least a certain user type in hierarchy
 */
export function isAtLeastUserType(
  user: RBACUser | null | undefined,
  minimumType: UserType
): boolean {
  if (!user) return false;
  
  const hierarchy: UserType[] = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'EMPLOYEE', 'WAITER', 'USER'];
  const userIndex = hierarchy.indexOf(user.userType);
  const minIndex = hierarchy.indexOf(minimumType);
  
  return userIndex <= minIndex;
}

/**
 * Check if user can manage another user based on their types
 */
export function canManageUser(
  currentUser: RBACUser | null | undefined,
  targetUserType: UserType
): boolean {
  if (!currentUser) return false;
  
  // Super admin can manage everyone
  if (hasImplicitFullAccess(currentUser.userType)) {
    return true;
  }
  
  // Branch admin can manage employees and waiters
  if (currentUser.userType === USER_TYPES.BRANCH_ADMIN) {
    return ['EMPLOYEE', 'WAITER', 'USER'].includes(targetUserType);
  }
  
  // Others cannot manage users
  return false;
}

// ==================== UI HELPERS ====================

/**
 * Get user type display name
 */
export function getUserTypeDisplayName(userType: UserType): string {
  const names: Record<UserType, string> = {
    SUPER_ADMIN: 'Super Admin',
    BRANCH_ADMIN: 'Branch Admin',
    EMPLOYEE: 'Employee',
    WAITER: 'Waiter',
    USER: 'Customer',
  };
  return names[userType] || userType;
}

/**
 * Get user type badge color
 */
export function getUserTypeBadgeColor(userType: UserType): string {
  const colors: Record<UserType, string> = {
    SUPER_ADMIN: 'bg-red-100 text-red-800',
    BRANCH_ADMIN: 'bg-purple-100 text-purple-800',
    EMPLOYEE: 'bg-blue-100 text-blue-800',
    WAITER: 'bg-green-100 text-green-800',
    USER: 'bg-gray-100 text-gray-800',
  };
  return colors[userType] || 'bg-gray-100 text-gray-800';
}

/**
 * Get resource display name
 */
export function getResourceDisplayName(resource: Resource): string {
  const names: Record<Resource, string> = {
    dashboard: 'Dashboard',
    orders: 'Orders',
    dispatch: 'Dispatch',
    kitchen: 'Kitchen',
    bar: 'Bar',
    reservations: 'Reservations',
    menu: 'Menu',
    deals: 'Deals',
    categories: 'Categories',
    meals: 'Meals',
    addons: 'Add-ons',
    optional_ingredients: 'Optional Ingredients',
    declarations: 'Declarations',
    branches: 'Branches',
    settings: 'Settings',
    deliverable_quantities: 'Deliverable Quantities',
    users: 'Users',
    roles: 'Roles',
    reports: 'Reports',
    end_of_day: 'End of Day',
    closed_days: 'Closed Days',
    analytics: 'Analytics',
    analytics_revenue: 'Revenue Analytics',
    analytics_category_insights: 'Category Insights',
    analytics_reservation: 'Reservation Analytics',
    notifications: 'Notifications',
    push_notifications: 'Push Notifications',
    hero_sections: 'Hero Sections',
    policies: 'Policies',
    tables: 'Tables',
    table_status_grid: 'Table Status Grid',
    zones: 'Zones',
  };
  return names[resource] || resource;
}

/**
 * Get action display name
 */
export function getActionDisplayName(action: Action): string {
  const names: Record<Action, string> = {
    view: 'View',
    edit: 'Edit',
    create: 'Create',
    update: 'Update',
    delete: 'Delete',
    view_history: 'View History',
    view_branch_settings: 'View Branch Settings',
    update_branch_settings: 'Update Branch Settings',
    view_branch_reservation_settings: 'View Branch Reservation Settings',
    update_branch_reservation_settings: 'Update Branch Reservation Settings',
    cancel: 'Cancel',
    refund: 'Refund',
    update_status: 'Update Status',
    reorder_featured: 'Reorder Featured',
    reorder_category: 'Reorder Category',
    ordering: 'Ordering',
    display_priority: 'Display Priority',
    confirm: 'Confirm',
    seat: 'Seat',
    complete: 'Complete',
    assign_roles: 'Assign Roles',
    assign_branches: 'Assign Branches',
    deactivate: 'Deactivate',
    manage: 'Manage',
    export: 'Export',
    close_day: 'Close Day',
    send: 'Send',
    toggle_active: 'Toggle Active',
    view_floor_plan: 'View Floor Plan',
    edit_floor_plan: 'Edit Floor Plan',
  };
  return names[action] || action;
}
