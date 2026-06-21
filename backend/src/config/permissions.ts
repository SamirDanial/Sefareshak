/**
 * RBAC Permission System
 * This file defines all resources, actions, and permission-related types
 * These definitions are used by both backend middleware and frontend permission checks
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
// All protected resources in the system
export const RESOURCES = {
  // Core business
  DASHBOARD: 'dashboard',
  
  // Operations
  ORDERS: 'orders',
  DISPATCH: 'dispatch',
  KITCHEN: 'kitchen',
  BAR: 'bar',
  RESERVATIONS: 'reservations',
  
  // Menu Management
  MENU: 'menu',
  DEALS: 'deals',
  CATEGORIES: 'categories',
  MEALS: 'meals',
  ADDONS: 'addons',
  OPTIONAL_INGREDIENTS: 'optional_ingredients',
  DECLARATIONS: 'declarations',
  
  // Branch & Settings
  BRANCHES: 'branches',
  SETTINGS: 'settings',
  DELIVERABLE_QUANTITIES: 'deliverable_quantities',
  
  // User management
  USERS: 'users',
  ROLES: 'roles',
  
  // Reports & Analytics
  // Legacy combined reports resource (kept for backward compatibility)
  REPORTS: 'reports',

  // Business day reporting
  END_OF_DAY: 'end_of_day',
  CLOSED_DAYS: 'closed_days',

  ANALYTICS: 'analytics',
  ANALYTICS_REVENUE: 'analytics_revenue',
  ANALYTICS_CATEGORY_INSIGHTS: 'analytics_category_insights',
  ANALYTICS_RESERVATION: 'analytics_reservation',
  
  // Communication
  NOTIFICATIONS: 'notifications',
  PUSH_NOTIFICATIONS: 'push_notifications',
  
  // Content
  HERO_SECTIONS: 'hero_sections',
  POLICIES: 'policies',
  
  // Tables & Zones (for reservations)
  TABLES: 'tables',
  TABLE_STATUS_GRID: 'table_status_grid',
  ZONES: 'zones',
} as const;

export type Resource = typeof RESOURCES[keyof typeof RESOURCES];

// ==================== ACTIONS ====================
// All possible actions on resources
export const ACTIONS = {
  // Basic CRUD
  VIEW: 'view',
  EDIT: 'edit',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  VIEW_HISTORY: 'view_history',

  // Branch settings granularity
  VIEW_BRANCH_SETTINGS: 'view_branch_settings',
  UPDATE_BRANCH_SETTINGS: 'update_branch_settings',
  VIEW_BRANCH_RESERVATION_SETTINGS: 'view_branch_reservation_settings',
  UPDATE_BRANCH_RESERVATION_SETTINGS: 'update_branch_reservation_settings',

  // Meal-specific
  REORDER_FEATURED: 'reorder_featured',
  REORDER_CATEGORY: 'reorder_category',

  // Category-specific
  ORDERING: 'ordering',
  DISPLAY_PRIORITY: 'display_priority',
  
  // Order-specific
  CANCEL: 'cancel',
  REFUND: 'refund',
  UPDATE_STATUS: 'update_status',
  
  // Reservation-specific
  CONFIRM: 'confirm',
  SEAT: 'seat',
  COMPLETE: 'complete',
  
  // User-specific
  ASSIGN_ROLES: 'assign_roles',
  ASSIGN_BRANCHES: 'assign_branches',
  DEACTIVATE: 'deactivate',
  
  // Settings-specific
  MANAGE: 'manage',
  
  // Report-specific
  EXPORT: 'export',

  // Business day specific
  CLOSE_DAY: 'close_day',
  
  // Notification-specific
  SEND: 'send',
  VIEW_STATS: 'view_stats',
  SEND_ORGANIZATION: 'send_organization',
  
  // Toggle active status
  TOGGLE_ACTIVE: 'toggle_active',

  // Floor plan permissions
  VIEW_FLOOR_PLAN: 'view_floor_plan',
  EDIT_FLOOR_PLAN: 'edit_floor_plan',

  // Branch urgent close
  URGENT_CLOSE_BRANCH: 'urgent_close_branch',
} as const;

export type Action = typeof ACTIONS[keyof typeof ACTIONS];

// ==================== PERMISSION MAP ====================
// Defines which actions are valid for each resource
export const RESOURCE_ACTIONS: Record<Resource, readonly Action[]> = {
  [RESOURCES.DASHBOARD]: [ACTIONS.VIEW],
  
  [RESOURCES.DISPATCH]: [
    ACTIONS.VIEW,
    ACTIONS.EDIT,
  ],

  [RESOURCES.ORDERS]: [
    ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE,
    ACTIONS.CANCEL, ACTIONS.REFUND, ACTIONS.UPDATE_STATUS
  ],
  
  [RESOURCES.RESERVATIONS]: [
    ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE,
    ACTIONS.CANCEL, ACTIONS.REFUND, ACTIONS.CONFIRM, ACTIONS.SEAT, ACTIONS.COMPLETE,
    ACTIONS.VIEW_HISTORY
  ],

  [RESOURCES.KITCHEN]: [
    ACTIONS.VIEW,
    ACTIONS.EDIT,
    ACTIONS.UPDATE_STATUS,
    ACTIONS.MANAGE,
  ],

  [RESOURCES.BAR]: [
    ACTIONS.VIEW,
    ACTIONS.EDIT,
  ],
  
  [RESOURCES.MENU]: [
    ACTIONS.VIEW,
    ACTIONS.CREATE,
    ACTIONS.UPDATE,
    ACTIONS.DELETE,
    ACTIONS.TOGGLE_ACTIVE,
    ACTIONS.REORDER_FEATURED,
    ACTIONS.REORDER_CATEGORY,
  ],

  [RESOURCES.DEALS]: [
    ACTIONS.VIEW,
    ACTIONS.CREATE,
    ACTIONS.UPDATE,
    ACTIONS.DELETE,
    ACTIONS.TOGGLE_ACTIVE,
    ACTIONS.REORDER_FEATURED,
    ACTIONS.REORDER_CATEGORY,
  ],
  
  [RESOURCES.CATEGORIES]: [
    ACTIONS.VIEW,
    ACTIONS.CREATE,
    ACTIONS.UPDATE,
    ACTIONS.DELETE,
    ACTIONS.TOGGLE_ACTIVE,
    ACTIONS.ORDERING,
    ACTIONS.DISPLAY_PRIORITY,
  ],
  
  [RESOURCES.MEALS]: [
    ACTIONS.VIEW,
    ACTIONS.CREATE,
    ACTIONS.UPDATE,
    ACTIONS.DELETE,
    ACTIONS.TOGGLE_ACTIVE,
    ACTIONS.REORDER_FEATURED,
    ACTIONS.REORDER_CATEGORY,
  ],
  
  [RESOURCES.ADDONS]: [
    ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.TOGGLE_ACTIVE
  ],

  [RESOURCES.OPTIONAL_INGREDIENTS]: [
    ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE
  ],
  
  [RESOURCES.DECLARATIONS]: [
    ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE
  ],
  
  [RESOURCES.BRANCHES]: [
    ACTIONS.VIEW,
    ACTIONS.VIEW_BRANCH_SETTINGS,
    ACTIONS.UPDATE_BRANCH_SETTINGS,
    ACTIONS.VIEW_BRANCH_RESERVATION_SETTINGS,
    ACTIONS.UPDATE_BRANCH_RESERVATION_SETTINGS,
    ACTIONS.URGENT_CLOSE_BRANCH,
  ],
  
  [RESOURCES.SETTINGS]: [
    ACTIONS.VIEW, ACTIONS.UPDATE, ACTIONS.MANAGE
  ],

  [RESOURCES.DELIVERABLE_QUANTITIES]: [
    ACTIONS.VIEW, ACTIONS.MANAGE
  ],
  
  [RESOURCES.USERS]: [
    ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE,
    ACTIONS.ASSIGN_ROLES, ACTIONS.ASSIGN_BRANCHES, ACTIONS.DEACTIVATE
  ],
  
  [RESOURCES.ROLES]: [
    ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE
  ],
  
  [RESOURCES.REPORTS]: [
    ACTIONS.VIEW, ACTIONS.EXPORT
  ],

  [RESOURCES.END_OF_DAY]: [
    ACTIONS.VIEW, ACTIONS.CLOSE_DAY
  ],

  [RESOURCES.CLOSED_DAYS]: [
    ACTIONS.VIEW
  ],
  
  [RESOURCES.ANALYTICS]: [
    ACTIONS.VIEW, ACTIONS.EXPORT
  ],

  [RESOURCES.ANALYTICS_REVENUE]: [
    ACTIONS.VIEW, ACTIONS.EXPORT
  ],

  [RESOURCES.ANALYTICS_CATEGORY_INSIGHTS]: [
    ACTIONS.VIEW
  ],

  [RESOURCES.ANALYTICS_RESERVATION]: [
    ACTIONS.VIEW
  ],
  
  [RESOURCES.NOTIFICATIONS]: [
    ACTIONS.VIEW
  ],
  
  [RESOURCES.PUSH_NOTIFICATIONS]: [
    ACTIONS.VIEW, ACTIONS.SEND, ACTIONS.VIEW_STATS, ACTIONS.SEND_ORGANIZATION
  ],
  
  [RESOURCES.HERO_SECTIONS]: [
    ACTIONS.VIEW, ACTIONS.UPDATE
  ],
  
  [RESOURCES.POLICIES]: [
    ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.TOGGLE_ACTIVE
  ],
  
  [RESOURCES.TABLES]: [
    ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.TOGGLE_ACTIVE
  ],

  [RESOURCES.TABLE_STATUS_GRID]: [ACTIONS.VIEW],
  
  [RESOURCES.ZONES]: [
    ACTIONS.VIEW,
    ACTIONS.CREATE,
    ACTIONS.UPDATE,
    ACTIONS.DELETE,
    ACTIONS.TOGGLE_ACTIVE,
    ACTIONS.VIEW_FLOOR_PLAN,
    ACTIONS.EDIT_FLOOR_PLAN,
  ],
} as const;

// ==================== PERMISSION TYPES ====================
export type Permission = {
  resource: Resource;
  action: Action;
};

export type PermissionSet = {
  [key in Resource]?: Action[];
};

// ==================== DEFAULT PERMISSIONS BY USER TYPE ====================
// These are the built-in permissions for each user type
// SUPER_ADMIN has all permissions implicitly (checked in code)
// These defaults are used when a user has no custom roles assigned

export const DEFAULT_PERMISSIONS: Record<UserType, PermissionSet> = {
  SUPER_ADMIN: {}, // Has all permissions implicitly
  
  BRANCH_ADMIN: {
    [RESOURCES.DASHBOARD]: [ACTIONS.VIEW],
    [RESOURCES.ORDERS]: [
      ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, 
      ACTIONS.CANCEL, ACTIONS.REFUND, ACTIONS.UPDATE_STATUS
    ],
    [RESOURCES.RESERVATIONS]: [
      ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE,
      ACTIONS.CANCEL, ACTIONS.REFUND, ACTIONS.CONFIRM, ACTIONS.SEAT, ACTIONS.COMPLETE
    ],
    [RESOURCES.MENU]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.TOGGLE_ACTIVE],
    [RESOURCES.DEALS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.TOGGLE_ACTIVE],
    [RESOURCES.CATEGORIES]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.TOGGLE_ACTIVE],
    [RESOURCES.MEALS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.TOGGLE_ACTIVE],
    [RESOURCES.ADDONS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.TOGGLE_ACTIVE],
    [RESOURCES.OPTIONAL_INGREDIENTS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE],
    [RESOURCES.DECLARATIONS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE],
    [RESOURCES.BRANCHES]: [
      ACTIONS.VIEW,
      ACTIONS.VIEW_BRANCH_SETTINGS,
      ACTIONS.UPDATE_BRANCH_SETTINGS,
      ACTIONS.VIEW_BRANCH_RESERVATION_SETTINGS,
      ACTIONS.UPDATE_BRANCH_RESERVATION_SETTINGS,
      ACTIONS.URGENT_CLOSE_BRANCH,
    ], // Only their assigned branches
    [RESOURCES.SETTINGS]: [ACTIONS.VIEW, ACTIONS.UPDATE], // Branch-level settings only
    [RESOURCES.USERS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.ASSIGN_ROLES], // For their branch
    [RESOURCES.ROLES]: [ACTIONS.VIEW],
    // Business day permissions
    [RESOURCES.END_OF_DAY]: [ACTIONS.VIEW, ACTIONS.CLOSE_DAY],
    [RESOURCES.CLOSED_DAYS]: [ACTIONS.VIEW],

    // Legacy combined reports permission (kept for backward compatibility)
    [RESOURCES.REPORTS]: [ACTIONS.VIEW, ACTIONS.EXPORT],
    [RESOURCES.ANALYTICS]: [ACTIONS.VIEW, ACTIONS.EXPORT],
    [RESOURCES.ANALYTICS_REVENUE]: [ACTIONS.VIEW, ACTIONS.EXPORT],
    [RESOURCES.ANALYTICS_CATEGORY_INSIGHTS]: [ACTIONS.VIEW],
    [RESOURCES.ANALYTICS_RESERVATION]: [ACTIONS.VIEW],
    [RESOURCES.NOTIFICATIONS]: [ACTIONS.VIEW],
    [RESOURCES.PUSH_NOTIFICATIONS]: [ACTIONS.VIEW, ACTIONS.SEND, ACTIONS.VIEW_STATS, ACTIONS.SEND_ORGANIZATION],
    [RESOURCES.HERO_SECTIONS]: [ACTIONS.VIEW],
    [RESOURCES.POLICIES]: [ACTIONS.VIEW],
    [RESOURCES.TABLES]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.TOGGLE_ACTIVE],
    [RESOURCES.TABLE_STATUS_GRID]: [ACTIONS.VIEW],
    [RESOURCES.ZONES]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.TOGGLE_ACTIVE],
  },
  
  EMPLOYEE: {
    // No default permissions; access is controlled via assigned roles.
  },
  
  WAITER: {
    [RESOURCES.DASHBOARD]: [ACTIONS.VIEW],
    [RESOURCES.ORDERS]: [ACTIONS.VIEW, ACTIONS.CREATE],
    [RESOURCES.RESERVATIONS]: [ACTIONS.VIEW, ACTIONS.SEAT],
    [RESOURCES.MENU]: [ACTIONS.VIEW],
    [RESOURCES.DEALS]: [ACTIONS.VIEW],
    [RESOURCES.MEALS]: [ACTIONS.VIEW],
    [RESOURCES.TABLES]: [ACTIONS.VIEW],
    [RESOURCES.ZONES]: [ACTIONS.VIEW],
  },
  
  USER: {}, // Regular customers - no admin panel access
};

// ==================== SYSTEM ROLES ====================
// Predefined system roles that cannot be deleted
export const SYSTEM_ROLES = {
  FULL_ACCESS: {
    name: 'Full Access',
    description: 'Complete access to all resources and actions',
    permissions: Object.entries(RESOURCE_ACTIONS).reduce((acc, [resource, actions]) => {
      acc[resource as Resource] = [...actions];
      return acc;
    }, {} as PermissionSet),
  },
  
  MANAGER: {
    name: 'Manager',
    description: 'Can view, create, and update most resources but cannot delete',
    permissions: {
      [RESOURCES.DASHBOARD]: [ACTIONS.VIEW],
      [RESOURCES.ORDERS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.UPDATE_STATUS, ACTIONS.CANCEL],
      [RESOURCES.RESERVATIONS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.CONFIRM, ACTIONS.SEAT, ACTIONS.COMPLETE, ACTIONS.CANCEL],
      [RESOURCES.MENU]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE],
      [RESOURCES.DEALS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE],
      [RESOURCES.CATEGORIES]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE],
      [RESOURCES.MEALS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE],
      [RESOURCES.ADDONS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE],
      [RESOURCES.DECLARATIONS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE],
      [RESOURCES.END_OF_DAY]: [ACTIONS.VIEW, ACTIONS.CLOSE_DAY],
      [RESOURCES.CLOSED_DAYS]: [ACTIONS.VIEW],
      [RESOURCES.ANALYTICS]: [ACTIONS.VIEW],
      [RESOURCES.TABLES]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE],
      [RESOURCES.ZONES]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE],
      [RESOURCES.NOTIFICATIONS]: [ACTIONS.VIEW],
    } as PermissionSet,
  },
  
  STAFF: {
    name: 'Staff',
    description: 'Can view and create, but cannot edit or delete',
    permissions: {
      [RESOURCES.DASHBOARD]: [ACTIONS.VIEW],
      [RESOURCES.ORDERS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE_STATUS],
      [RESOURCES.RESERVATIONS]: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.CONFIRM, ACTIONS.SEAT, ACTIONS.COMPLETE],
      [RESOURCES.MENU]: [ACTIONS.VIEW],
      [RESOURCES.DEALS]: [ACTIONS.VIEW],
      [RESOURCES.CATEGORIES]: [ACTIONS.VIEW],
      [RESOURCES.MEALS]: [ACTIONS.VIEW],
      [RESOURCES.ADDONS]: [ACTIONS.VIEW],
      [RESOURCES.TABLES]: [ACTIONS.VIEW],
      [RESOURCES.TABLE_STATUS_GRID]: [ACTIONS.VIEW],
      [RESOURCES.ZONES]: [ACTIONS.VIEW],
      [RESOURCES.NOTIFICATIONS]: [ACTIONS.VIEW],
    } as PermissionSet,
  },
  
  VIEW_ONLY: {
    name: 'View Only',
    description: 'Read-only access to resources',
    permissions: {
      [RESOURCES.DASHBOARD]: [ACTIONS.VIEW],
      [RESOURCES.ORDERS]: [ACTIONS.VIEW],
      [RESOURCES.RESERVATIONS]: [ACTIONS.VIEW],
      [RESOURCES.MENU]: [ACTIONS.VIEW],
      [RESOURCES.DEALS]: [ACTIONS.VIEW],
      [RESOURCES.CATEGORIES]: [ACTIONS.VIEW],
      [RESOURCES.MEALS]: [ACTIONS.VIEW],
      [RESOURCES.ADDONS]: [ACTIONS.VIEW],
      [RESOURCES.END_OF_DAY]: [ACTIONS.VIEW],
      [RESOURCES.CLOSED_DAYS]: [ACTIONS.VIEW],
      [RESOURCES.TABLES]: [ACTIONS.VIEW],
      [RESOURCES.TABLE_STATUS_GRID]: [ACTIONS.VIEW],
      [RESOURCES.ZONES]: [ACTIONS.VIEW],
    } as PermissionSet,
  },
} as const;

// ==================== HELPER FUNCTIONS ====================

/**
 * Check if a user type has implicit full access (SUPER_ADMIN)
 */
export function hasImplicitFullAccess(userType: UserType): boolean {
  return userType === USER_TYPES.SUPER_ADMIN;
}

/**
 * Check if a permission set includes a specific action on a resource
 */
export function hasPermission(
  permissions: PermissionSet,
  resource: Resource,
  action: Action
): boolean {
  const resourcePermissions = permissions[resource];
  if (!resourcePermissions) return false;

  if (resourcePermissions.includes(action)) return true;

  // If a route checks for UPDATE_STATUS, allow EDIT/MANAGE/UPDATE to imply it.
  // This keeps "edit" semantics consistent across modules (e.g. Kitchen ticket status changes).
  if (action === ACTIONS.UPDATE_STATUS) {
    return (
      resourcePermissions.includes(ACTIONS.EDIT) ||
      resourcePermissions.includes(ACTIONS.MANAGE) ||
      resourcePermissions.includes(ACTIONS.UPDATE)
    );
  }

  // Backward compatibility + coarse-grained actions:
  // If a route checks for EDIT, allow legacy/stronger actions that imply edit.
  if (action === ACTIONS.EDIT) {
    return (
      resourcePermissions.includes(ACTIONS.MANAGE) ||
      resourcePermissions.includes(ACTIONS.UPDATE) ||
      resourcePermissions.includes(ACTIONS.UPDATE_STATUS) ||
      resourcePermissions.includes(ACTIONS.CREATE) ||
      resourcePermissions.includes(ACTIONS.DELETE)
    );
  }

  return false;
}

/**
 * Merge multiple permission sets (union of all permissions)
 */
export function mergePermissions(...permissionSets: PermissionSet[]): PermissionSet {
  const merged: PermissionSet = {};
  
  for (const permissions of permissionSets) {
    for (const [resource, actions] of Object.entries(permissions)) {
      if (!merged[resource as Resource]) {
        merged[resource as Resource] = [];
      }
      for (const action of actions) {
        if (!merged[resource as Resource]!.includes(action)) {
          merged[resource as Resource]!.push(action);
        }
      }
    }
  }
  
  return merged;
}

/**
 * Get all available actions for a resource
 */
export function getResourceActions(resource: Resource): readonly Action[] {
  return RESOURCE_ACTIONS[resource] || [];
}

/**
 * Validate that a permission set only contains valid resource-action combinations
 */
export function validatePermissions(permissions: PermissionSet): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const [resource, actions] of Object.entries(permissions)) {
    const validActions = RESOURCE_ACTIONS[resource as Resource];
    
    if (!validActions) {
      errors.push(`Invalid resource: ${resource}`);
      continue;
    }
    
    for (const action of actions) {
      if (!validActions.includes(action)) {
        errors.push(`Invalid action '${action}' for resource '${resource}'`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}
