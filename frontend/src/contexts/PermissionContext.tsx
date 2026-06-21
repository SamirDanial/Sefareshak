/**
 * Permission Context
 * 
 * Provides RBAC user data and permission checking throughout the app.
 * Fetches permissions from the backend on auth and caches them.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth as useAppAuth } from '@/contexts/AuthContext';
import type { RBACUser, Resource, Action } from '../lib/permissions';
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasBranchAccess,
  canPerformOnBranch,
} from '../lib/permissions';

interface PermissionContextType {
  rbacUser: RBACUser | null;
  isLoading: boolean;
  error: string | null;
  
  // Permission checks
  can: (resource: Resource, action: Action) => boolean;
  canAny: (permissions: Array<{ resource: Resource; action: Action }>) => boolean;
  canAll: (permissions: Array<{ resource: Resource; action: Action }>) => boolean;
  canOnBranch: (resource: Resource, action: Action, branchId: string) => boolean;
  hasBranch: (branchId: string) => boolean;
  
  // User info
  isSuperAdmin: boolean;
  isBranchAdmin: boolean;
  isStaff: boolean;
  isOrgAdmin: boolean;
  assignedBranchIds: string[];
  
  // Refresh
  refreshPermissions: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | null>(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type FetchOptions = {
  background?: boolean;
  force?: boolean;
};

const FOCUS_REFRESH_MIN_INTERVAL_MS = 30_000;

function stableStringifyPermissions(permissions: any): string {
  try {
    if (!Array.isArray(permissions)) return '';
    return permissions
      .map((p) => `${String(p?.resource ?? '')}:${String(p?.action ?? '')}`)
      .sort()
      .join('|');
  } catch {
    return '';
  }
}

function areRbacUsersEquivalent(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const aAssigned = Array.isArray(a.assignedBranchIds) ? [...a.assignedBranchIds].sort() : [];
  const bAssigned = Array.isArray(b.assignedBranchIds) ? [...b.assignedBranchIds].sort() : [];

  if (a.userType !== b.userType) return false;
  if (a.orgRole !== b.orgRole) return false;
  if (Boolean(a.hasFullAccess) !== Boolean(b.hasFullAccess)) return false;
  if (aAssigned.length !== bAssigned.length) return false;
  for (let i = 0; i < aAssigned.length; i++) {
    if (aAssigned[i] !== bAssigned[i]) return false;
  }

  const aPerm = stableStringifyPermissions(a.permissions);
  const bPerm = stableStringifyPermissions(b.permissions);
  if (aPerm !== bPerm) return false;

  return true;
}

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, getToken } = useAppAuth();
  const [rbacUser, setRbacUser] = useState<RBACUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedAtRef = useRef<number>(0);
  const rbacUserRef = useRef<RBACUser | null>(null);

  useEffect(() => {
    rbacUserRef.current = rbacUser;
  }, [rbacUser]);

  const fetchPermissions = useCallback(async (options: FetchOptions = {}) => {
    const { background = false, force = false } = options;
    if (!isSignedIn) {
      setRbacUser(null);
      setIsLoading(false);
      return;
    }

    const now = Date.now();
    if (!force && now - lastFetchedAtRef.current < FOCUS_REFRESH_MIN_INTERVAL_MS) {
      return;
    }

    try {
      if (!background) {
        setIsLoading(true);
      }
      setError(null);

      const token = await getToken();
      const response = await fetch(`${API_URL}/api/permissions/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // On background refresh (e.g. window focus), do NOT clear existing permissions.
        if (background && rbacUserRef.current) {
          setError('Failed to fetch permissions');
          return;
        }
        throw new Error('Failed to fetch permissions');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        const nextUser = data.data;
        // If this is a background refresh and the returned user is effectively identical,
        // avoid updating state (prevents analytics filters from re-initializing on focus).
        if (background && rbacUserRef.current && areRbacUsersEquivalent(rbacUserRef.current, nextUser)) {
          lastFetchedAtRef.current = Date.now();
          return;
        }

        setRbacUser(nextUser);
        lastFetchedAtRef.current = Date.now();
      } else {
        throw new Error(data.error || 'Failed to fetch permissions');
      }
    } catch (err: any) {
      console.error('Permission fetch error:', err);
      // On background refresh, keep the existing RBAC user to avoid unmount/remount blinking.
      if (background && rbacUserRef.current) {
        setError(err.message);
        return;
      }
      setError(err.message);
      setRbacUser(null);
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    fetchPermissions({ force: true });
  }, [fetchPermissions]);

  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchPermissions({ background: true });
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [fetchPermissions]);

  // Derived: is this user an org admin?
  const _isOrgAdmin = (rbacUser as any)?.orgRole === 'ORG_OWNER' || (rbacUser as any)?.orgRole === 'ORG_ADMIN';

  const _isBranchAdmin = rbacUser?.userType === 'BRANCH_ADMIN';

  const branchAdminAllows = useCallback(
    (resource: Resource, _action: Action): boolean => {
      if (!_isBranchAdmin) return false;
      if (resource === 'optional_ingredients') return true;
      return false;
    },
    [_isBranchAdmin]
  );

  const orgAdminAllows = useCallback(
    (resource: Resource, action: Action): boolean => {
      if (!_isOrgAdmin) return false;
      if (resource === 'branches' && action === 'delete') return false;
      return true;
    },
    [_isOrgAdmin]
  );

  // Permission check functions
  // ORG_OWNER/ORG_ADMIN get broad access within their org, with explicit carve-outs.
  const can = useCallback(
    (resource: Resource, action: Action): boolean => {
      if (_isOrgAdmin) return orgAdminAllows(resource, action);
      if (_isBranchAdmin) return branchAdminAllows(resource, action) || hasPermission(rbacUser, resource, action);
      return hasPermission(rbacUser, resource, action);
    },
    [rbacUser, _isOrgAdmin, orgAdminAllows, _isBranchAdmin, branchAdminAllows]
  );

  const canAny = useCallback(
    (permissions: Array<{ resource: Resource; action: Action }>): boolean => {
      if (_isOrgAdmin) return permissions.some(({ resource, action }) => orgAdminAllows(resource, action));
      if (_isBranchAdmin)
        return permissions.some(({ resource, action }) => branchAdminAllows(resource, action))
          || hasAnyPermission(rbacUser, permissions);
      return hasAnyPermission(rbacUser, permissions);
    },
    [rbacUser, _isOrgAdmin, orgAdminAllows, _isBranchAdmin, branchAdminAllows]
  );

  const canAll = useCallback(
    (permissions: Array<{ resource: Resource; action: Action }>): boolean => {
      if (_isOrgAdmin) return permissions.every(({ resource, action }) => orgAdminAllows(resource, action));
      if (_isBranchAdmin)
        return permissions.every(({ resource, action }) => branchAdminAllows(resource, action) || hasPermission(rbacUser, resource, action));
      return hasAllPermissions(rbacUser, permissions);
    },
    [rbacUser, _isOrgAdmin, orgAdminAllows, _isBranchAdmin, branchAdminAllows]
  );

  const canOnBranch = useCallback(
    (resource: Resource, action: Action, branchId: string): boolean => {
      return canPerformOnBranch(rbacUser, resource, action, branchId);
    },
    [rbacUser]
  );

  const hasBranch = useCallback(
    (branchId: string): boolean => {
      return hasBranchAccess(rbacUser, branchId);
    },
    [rbacUser]
  );

  // Derived states
  const isSuperAdmin = useMemo(
    () => rbacUser?.userType === 'SUPER_ADMIN' || rbacUser?.hasFullAccess === true,
    [rbacUser]
  );

  const isBranchAdmin = useMemo(
    () => rbacUser?.userType === 'BRANCH_ADMIN',
    [rbacUser]
  );

  const isStaff = useMemo(
    () => ['SUPER_ADMIN', 'BRANCH_ADMIN', 'EMPLOYEE', 'WAITER'].includes(rbacUser?.userType || ''),
    [rbacUser]
  );

  const isOrgAdmin = useMemo(
    () => (rbacUser as any)?.orgRole === 'ORG_OWNER' || (rbacUser as any)?.orgRole === 'ORG_ADMIN',
    [rbacUser]
  );

  const assignedBranchIds = useMemo(
    () => rbacUser?.assignedBranchIds || [],
    [rbacUser]
  );

  const value: PermissionContextType = {
    rbacUser,
    isLoading,
    error,
    can,
    canAny,
    canAll,
    canOnBranch,
    hasBranch,
    isSuperAdmin,
    isBranchAdmin,
    isStaff,
    isOrgAdmin,
    assignedBranchIds,
    refreshPermissions: () => fetchPermissions({ force: true }),
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions(): PermissionContextType {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return context;
}

// ==================== PERMISSION GATE COMPONENT ====================

interface PermissionGateProps {
  resource: Resource;
  action: Action;
  branchId?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({
  resource,
  action,
  branchId,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { can, canOnBranch, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  const hasAccess = branchId
    ? canOnBranch(resource, action, branchId)
    : can(resource, action);

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// ==================== REQUIRE PERMISSION COMPONENT ====================

interface RequirePermissionProps {
  resource: Resource;
  action: Action;
  branchId?: string;
  redirectTo?: string;
  children: React.ReactNode;
}

export function RequirePermission({
  resource,
  action,
  branchId,
  redirectTo = '/unauthorized',
  children,
}: RequirePermissionProps) {
  const { can, canOnBranch, isLoading, rbacUser } = usePermissions();

  if (isLoading && !rbacUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const hasAccess = branchId
    ? canOnBranch(resource, action, branchId)
    : can(resource, action);

  if (!hasAccess) {
    // You could use react-router's Navigate here
    window.location.href = redirectTo;
    return null;
  }

  return <>{children}</>;
}

// ==================== REQUIRE ANY PERMISSION COMPONENT ====================

interface RequireAnyPermissionProps {
  permissions: Array<{ resource: Resource; action: Action }>;
  redirectTo?: string;
  children: React.ReactNode;
}

export function RequireAnyPermission({
  permissions,
  redirectTo = '/unauthorized',
  children,
}: RequireAnyPermissionProps) {
  const { canAny, isLoading, rbacUser } = usePermissions();

  if (isLoading && !rbacUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const hasAccess = canAny(permissions);

  if (!hasAccess) {
    window.location.href = redirectTo;
    return null;
  }

  return <>{children}</>;
}

// ==================== BRANCH GATE COMPONENT ====================

interface BranchGateProps {
  branchId: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function BranchGate({ branchId, fallback = null, children }: BranchGateProps) {
  const { hasBranch, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  return hasBranch(branchId) ? <>{children}</> : <>{fallback}</>;
}

// ==================== STAFF ONLY COMPONENT ====================

interface StaffOnlyProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function StaffOnly({ fallback = null, children }: StaffOnlyProps) {
  const { isStaff, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  return isStaff ? <>{children}</> : <>{fallback}</>;
}

// ==================== SUPER ADMIN ONLY COMPONENT ====================

interface SuperAdminOnlyProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function SuperAdminOnly({ fallback = null, children }: SuperAdminOnlyProps) {
  const { isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  return isSuperAdmin ? <>{children}</> : <>{fallback}</>;
}
