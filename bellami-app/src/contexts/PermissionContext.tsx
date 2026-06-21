import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AppState } from "react-native";

import ApiService from "@/src/services/apiService";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";

import type { Action, RBACUser, Resource } from "@/src/utils/permissions";
import {
  canPerformOnBranch,
  hasAllPermissions,
  hasAnyPermission,
  hasBranchAccess,
  hasPermission,
} from "@/src/utils/permissions";

interface PermissionContextType {
  rbacUser: RBACUser | null;
  isLoading: boolean;
  error: string | null;

  can: (resource: Resource, action: Action) => boolean;
  canAny: (permissions: Array<{ resource: Resource; action: Action }>) => boolean;
  canAll: (permissions: Array<{ resource: Resource; action: Action }>) => boolean;
  canOnBranch: (resource: Resource, action: Action, branchId: string) => boolean;
  hasBranch: (branchId: string) => boolean;

  isSuperAdmin: boolean;
  isBranchAdmin: boolean;
  isStaff: boolean;
  isOrgAdmin: boolean;
  assignedBranchIds: string[];

  refreshPermissions: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | null>(null);

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuthRole();
  const { selectedOrganizationId, setSelectedOrganizationId } = useOrganization();
  const [rbacUser, setRbacUser] = useState<RBACUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isOrgAdmin = useMemo(
    () => (rbacUser as any)?.orgRole === "ORG_OWNER" || (rbacUser as any)?.orgRole === "ORG_ADMIN",
    [rbacUser]
  );

  const orgAdminAllows = useCallback(
    (resource: Resource, action: Action): boolean => {
      if (!isOrgAdmin) return false;
      if (resource === "branches" && action === "delete") return false;
      return true;
    },
    [isOrgAdmin]
  );

  const fetchPermissions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = await getToken();

      if (!token) {
        return;
      }

      const apiService = ApiService.getInstance();
      const data = await apiService.get("/api/permissions/me", token);

      if (data?.success && data?.data) {
        const nextUser = data.data as RBACUser;
        setRbacUser(nextUser);

        // Ensure org admins have an organization selected so org-scoped APIs work
        // (e.g. /api/meals which resolves org from x-organization-id).
        const nextOrgId = (nextUser as any)?.organizationId as string | null | undefined;
        const nextOrgRole = (nextUser as any)?.orgRole as string | null | undefined;
        const nextIsOrgAdmin = nextOrgRole === "ORG_OWNER" || nextOrgRole === "ORG_ADMIN";
        if (nextIsOrgAdmin && nextOrgId && !selectedOrganizationId) {
          try {
            await setSelectedOrganizationId(nextOrgId);
          } catch {
            // ignore storage failures; app will still function but may require manual selection
          }
        }
      } else {
        setRbacUser(null);
        setError((data?.error as string | undefined) || "Failed to fetch permissions");
      }
    } catch (err: any) {
      console.error("Permission fetch error:", {
        message: err?.message,
        status: err?.status,
        url: err?.url,
        method: err?.method,
        data: err?.data,
      });
      setError(err?.message || "Failed to fetch permissions");
      setRbacUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [getToken, selectedOrganizationId, setSelectedOrganizationId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        fetchPermissions();
      }
    });

    return () => {
      sub.remove();
    };
  }, [fetchPermissions]);

  const can = useCallback(
    (resource: Resource, action: Action): boolean => {
      if (isOrgAdmin) return orgAdminAllows(resource, action);
      return hasPermission(rbacUser, resource, action);
    },
    [isOrgAdmin, orgAdminAllows, rbacUser]
  );

  const canAny = useCallback(
    (permissions: Array<{ resource: Resource; action: Action }>): boolean => {
      if (isOrgAdmin) return permissions.some(({ resource, action }) => orgAdminAllows(resource, action));
      return hasAnyPermission(rbacUser, permissions);
    },
    [isOrgAdmin, orgAdminAllows, rbacUser]
  );

  const canAll = useCallback(
    (permissions: Array<{ resource: Resource; action: Action }>): boolean => {
      if (isOrgAdmin) return permissions.every(({ resource, action }) => orgAdminAllows(resource, action));
      return hasAllPermissions(rbacUser, permissions);
    },
    [isOrgAdmin, orgAdminAllows, rbacUser]
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

  const isSuperAdmin = useMemo(
    () => rbacUser?.userType === "SUPER_ADMIN" || rbacUser?.hasFullAccess === true,
    [rbacUser]
  );

  const isBranchAdmin = useMemo(
    () => rbacUser?.userType === "BRANCH_ADMIN",
    [rbacUser]
  );

  const isStaff = useMemo(
    () => ["SUPER_ADMIN", "BRANCH_ADMIN", "EMPLOYEE", "WAITER"].includes(rbacUser?.userType || ""),
    [rbacUser]
  );

  const assignedBranchIds = useMemo(
    () => (Array.isArray(rbacUser?.assignedBranchIds) ? rbacUser?.assignedBranchIds || [] : []),
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
    refreshPermissions: fetchPermissions,
  };

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionContextType {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionProvider");
  }
  return context;
}
