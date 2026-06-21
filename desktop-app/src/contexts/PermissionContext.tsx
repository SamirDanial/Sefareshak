import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth as useAppAuth } from "./AuthContext";
import type { Action, RBACUser, Resource } from "../lib/permissions";
import {
  canPerformOnBranch,
  hasAllPermissions,
  hasAnyPermission,
  hasBranchAccess,
  hasPermission,
} from "../lib/permissions";
import ApiService from "../services/apiService";

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

type FetchOptions = {
  background?: boolean;
  force?: boolean;
};

const FOCUS_REFRESH_MIN_INTERVAL_MS = 30_000;

function stableStringifyPermissions(permissions: any): string {
  try {
    if (!Array.isArray(permissions) && typeof permissions !== "object") return "";
    if (Array.isArray(permissions)) {
      return permissions
        .map((p) => `${String((p as any)?.resource ?? "")}:${String((p as any)?.action ?? "")}`)
        .sort()
        .join("|");
    }

    // PermissionSet object: { [resource]: Action[] }
    return Object.entries(permissions)
      .flatMap(([resource, actions]) => {
        if (!Array.isArray(actions)) return [];
        return actions.map((action) => `${resource}:${String(action)}`);
      })
      .sort()
      .join("|");
  } catch {
    return "";
  }
}

function areRbacUsersEquivalent(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const aAssigned = Array.isArray(a.assignedBranchIds)
    ? [...a.assignedBranchIds].sort()
    : [];
  const bAssigned = Array.isArray(b.assignedBranchIds)
    ? [...b.assignedBranchIds].sort()
    : [];

  if (a.userType !== b.userType) return false;
  if ((a as any).orgRole !== (b as any).orgRole) return false;
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

  const fetchPermissions = useCallback(
    async (options: FetchOptions = {}) => {
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
        if (!token) {
          throw new Error("No auth token available");
        }

        const apiService = ApiService.getInstance();
        const response = await apiService.get("/api/permissions/me", token);

        const nextUser = (response as any)?.data as RBACUser | undefined;
        if (!nextUser) {
          throw new Error((response as any)?.error || "Failed to fetch permissions");
        }

        if (
          background &&
          rbacUserRef.current &&
          areRbacUsersEquivalent(rbacUserRef.current, nextUser)
        ) {
          lastFetchedAtRef.current = Date.now();
          return;
        }

        setRbacUser(nextUser);
        lastFetchedAtRef.current = Date.now();
      } catch (err: any) {
        console.error("Permission fetch error:", err);
        if (background && rbacUserRef.current) {
          setError(err?.message || "Failed to fetch permissions");
          return;
        }
        setError(err?.message || "Failed to fetch permissions");
        setRbacUser(null);
      } finally {
        if (!background) {
          setIsLoading(false);
        }
      }
    },
    [getToken, isSignedIn]
  );

  useEffect(() => {
    fetchPermissions({ force: true });
  }, [fetchPermissions]);

  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        fetchPermissions({ background: true });
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [fetchPermissions]);

  const _isOrgAdmin =
    (rbacUser as any)?.orgRole === "ORG_OWNER" ||
    (rbacUser as any)?.orgRole === "ORG_ADMIN";

  const _isBranchAdmin = rbacUser?.userType === "BRANCH_ADMIN";

  const branchAdminAllows = useCallback(
    (resource: Resource, _action: Action): boolean => {
      if (!_isBranchAdmin) return false;
      if (resource === "optional_ingredients") return true;
      return false;
    },
    [_isBranchAdmin]
  );

  const orgAdminAllows = useCallback(
    (resource: Resource, action: Action): boolean => {
      if (!_isOrgAdmin) return false;
      if (resource === "branches" && action === "delete") return false;
      return true;
    },
    [_isOrgAdmin]
  );

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
      if (_isOrgAdmin)
        return permissions.some(({ resource, action }) => orgAdminAllows(resource, action));
      if (_isBranchAdmin)
        return permissions.some(({ resource, action }) => branchAdminAllows(resource, action))
          || hasAnyPermission(rbacUser, permissions);
      return hasAnyPermission(rbacUser, permissions);
    },
    [rbacUser, _isOrgAdmin, orgAdminAllows, _isBranchAdmin, branchAdminAllows]
  );

  const canAll = useCallback(
    (permissions: Array<{ resource: Resource; action: Action }>): boolean => {
      if (_isOrgAdmin)
        return permissions.every(({ resource, action }) => orgAdminAllows(resource, action));
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

  const isSuperAdmin = useMemo(
    () => rbacUser?.userType === "SUPER_ADMIN" || rbacUser?.hasFullAccess === true,
    [rbacUser]
  );

  const isBranchAdmin = useMemo(() => rbacUser?.userType === "BRANCH_ADMIN", [rbacUser]);

  const isStaff = useMemo(
    () => ["SUPER_ADMIN", "BRANCH_ADMIN", "EMPLOYEE", "WAITER"].includes(String(rbacUser?.userType || "")),
    [rbacUser]
  );

  const isOrgAdmin = useMemo(() => _isOrgAdmin, [_isOrgAdmin]);

  const assignedBranchIds = useMemo(() => rbacUser?.assignedBranchIds || [], [rbacUser]);

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

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionContextType {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionProvider");
  }
  return context;
}
