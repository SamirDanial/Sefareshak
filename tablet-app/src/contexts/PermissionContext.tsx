import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from "react";
import { useUser } from "@clerk/clerk-expo";

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

const decodeJwtPayload = (token: string): any | null => {
  try {
    const tokenParts = String(token || "").split(".");
    if (tokenParts.length !== 3) return null;
    const b64 = String(tokenParts[1] || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

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
  const { getToken, userType } = useAuthRole();
  const { selectedOrganizationId, setSelectedOrganizationId } = useOrganization();
  const { isSignedIn, isLoaded, user } = useUser();
  const userId = user?.id || null;
  const [rbacUser, setRbacUser] = useState<RBACUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFallbackRef = useRef(false);
  const rbacUserRef = useRef<RBACUser | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastAttemptAtRef = useRef(0);
  const lastSuccessAtRef = useRef(0);
  const selectedOrgIdRef = useRef<string | null>(null);
  const setSelectedOrganizationIdRef = useRef(setSelectedOrganizationId);
  const hasCompletedInitialFetchRef = useRef(false);
  const lastFetchedUserIdRef = useRef<string | null>(null);


  useEffect(() => {
    rbacUserRef.current = rbacUser;
  }, [rbacUser]);

  useEffect(() => {
    selectedOrgIdRef.current = selectedOrganizationId;
  }, [selectedOrganizationId]);

  useEffect(() => {
    setSelectedOrganizationIdRef.current = setSelectedOrganizationId;
  }, [setSelectedOrganizationId]);

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
    // Only fetch permissions if user is authenticated (userType can be fetched independently)
    if (!isLoaded) {

      // SUPER ADMIN BYPASS: Check if we can determine super admin from token even if not fully loaded
      try {
        const token = await getToken();
        const tokenPayload = token ? decodeJwtPayload(token) : null;
        if (tokenPayload?.sub === 'user_34NqQnUEU8zWxLAWqEqJXADyG3a') {

          const superAdminPermissions: RBACUser = {
            id: "super_admin",
            email: "samirdanial7@gmail.com",
            firstName: "samir",
            lastName: "danial",
            userType: "SUPER_ADMIN",
            orgRole: null,
            organizationId: null,
            hasFullAccess: true,
            assignedBranchIds: [],
            permissions: {},
            roles: [],
          };

          setRbacUser(superAdminPermissions);
          setError(null);
          setIsLoading(false);
          hasFallbackRef.current = true;
          hasCompletedInitialFetchRef.current = true;
          lastFetchedUserIdRef.current = userId;
          lastSuccessAtRef.current = Date.now();
          return;
        }
      } catch (tokenError) {
      }

      setIsLoading(true);
      return;
    }

    if (!isSignedIn) {
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = null;
      hasFallbackRef.current = false;
      hasCompletedInitialFetchRef.current = false;
      lastFetchedUserIdRef.current = null;
      setRbacUser(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Prevent API calls during logout
    if (ApiService.shouldPreventRequest()) {
      return;
    }

    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const now = Date.now();
    if (now - lastAttemptAtRef.current < 1500) {
      return;
    }
    lastAttemptAtRef.current = now;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    // Only show loading state on initial fetch, not on re-fetches
    if (!hasCompletedInitialFetchRef.current) {
      setIsLoading(true);
    }

    const p = (async () => {
      try {
      // Skip if we already have a successful fallback
      if (hasFallbackRef.current && rbacUserRef.current) {
        return;
      }

      const token = await getToken();
      const tokenPayload = token ? decodeJwtPayload(token) : null;
      if (tokenPayload?.sub === 'user_34NqQnUEU8zWxLAWqEqJXADyG3a') {
        const superAdminPermissions: RBACUser = {
          id: "super_admin",
          email: "samirdanial7@gmail.com",
          firstName: "samir",
          lastName: "danial",
          userType: "SUPER_ADMIN",
          orgRole: null,
          organizationId: null,
          hasFullAccess: true,
          assignedBranchIds: [],
          permissions: {},
          roles: [],
        };
        setRbacUser(superAdminPermissions);
        setError(null);
        hasFallbackRef.current = true;
        lastSuccessAtRef.current = Date.now();
        return;
      }
      
      if (userType === "SUPER_ADMIN") {
        
        // Set super admin permissions directly without API call
        const superAdminPermissions: RBACUser = {
          id: "super_admin",
          email: "super@admin.com",
          firstName: "Super",
          lastName: "Admin",
          userType: "SUPER_ADMIN",
          orgRole: null,
          organizationId: null,
          hasFullAccess: true,
          assignedBranchIds: [],
          permissions: {},
          roles: []
        };
        
        setRbacUser(superAdminPermissions);
        setError(null);
        setIsLoading(false);
        hasFallbackRef.current = true;
        hasCompletedInitialFetchRef.current = true;
        lastFetchedUserIdRef.current = userId;
        lastSuccessAtRef.current = Date.now();
        return;
      }

      setError(null);
      
      if (!token) {
        setRbacUser(null);
        return;
      }

      const apiService = ApiService.getInstance();
      
      // Add retry mechanism for API calls
      let lastError: any = null;
      let data: any = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          data = await apiService.getMyPermissions(token, {
            timeoutMs: 30000,
            signal: abortRef.current?.signal,
          });
          break; // Success, exit retry loop
          
        } catch (error) {
          lastError = error;
          
          if (attempt < 3) {
            // Wait before retry (exponential backoff)
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // If all attempts failed, implement fallback for super admin
      if (!data && String(lastError?.message || "").toLowerCase().includes('timeout')) {
        
        // Check if we can determine super admin from the user profile that was fetched
        try {
          if (!tokenPayload?.sub) {
            throw new Error("Missing token payload");
          }
          
          // Check if this is the super admin user
          if (tokenPayload.sub === 'user_34NqQnUEU8zWxLAWqEqJXADyG3a') {
            
            data = {
              success: true,
              data: {
                assignedBranchIds: [],
                hasFullAccess: true,
                orgRole: null,
                organizationId: null,
                permissions: {},
                roles: [],
                userId: "super_admin",
                userType: "SUPER_ADMIN",
              },
            };
          } else {
            data = {
              success: true,
              data: {
                assignedBranchIds: [],
                hasFullAccess: false,
                orgRole: null,
                organizationId: null,
                permissions: {},
                roles: [],
                userId: "fallback",
                userType: "USER",
              },
            };
          }
        } catch {
          data = {
            success: true,
            data: {
              assignedBranchIds: [],
              hasFullAccess: true,
              orgRole: null,
              organizationId: null,
              permissions: {},
              roles: [],
              userId: "fallback",
              userType: "SUPER_ADMIN"
            }
          };
        }
        
        // Mark this as a fallback to prevent repeated calls
        (data as any).isFallback = true;
        hasFallbackRef.current = true;
      } else if (!data) {
        throw lastError;
      }
      

      if ((data as any)?.success && (data as any)?.data) {
        const nextUser = (data as any).data as RBACUser;
        setRbacUser(nextUser);
        lastSuccessAtRef.current = Date.now();
        hasCompletedInitialFetchRef.current = true;
        lastFetchedUserIdRef.current = userId;

        const nextOrgId = (nextUser as any)?.organizationId as string | null | undefined;
        const nextOrgRole = (nextUser as any)?.orgRole as string | null | undefined;
        const nextIsOrgAdmin = nextOrgRole === "ORG_OWNER" || nextOrgRole === "ORG_ADMIN";
        if (nextIsOrgAdmin && nextOrgId && !selectedOrgIdRef.current) {
          try {
            await setSelectedOrganizationIdRef.current(nextOrgId);
          } catch {
            // ignore
          }
        }
      } else {
        setRbacUser(null);
        setError(((data as any)?.error as string | undefined) || "Failed to fetch permissions");
      }
    } catch (err: any) {
      if (err?.isCancelled || err?.isAborted) {
        return;
      }
      console.error("Permission fetch error:", err);
      
      // Handle 401 authentication errors
      if (err?.isAuthError || err?.status === 401) {
        
        try {
          // Try to get a fresh token
          const freshToken = await getToken();
          
          // Retry with fresh token
          const apiService = ApiService.getInstance();
          const freshData = await apiService.getMyPermissions(freshToken!, {
            timeoutMs: 30000,
            signal: abortRef.current?.signal,
          });
          
          if ((freshData as any)?.success && (freshData as any)?.data) {
            const nextUser = (freshData as any).data as RBACUser;
            setRbacUser(nextUser);
            setError(null);
            lastSuccessAtRef.current = Date.now();
            hasCompletedInitialFetchRef.current = true;
            lastFetchedUserIdRef.current = userId;
            return;
          }
        } catch (refreshError) {
        }
        
        // If refresh failed, show authentication error but preserve existing session
        // so a transient 401 (e.g. during a heavy refund operation) doesn't route the user to /no-access
        setError("Authentication expired. Please log in again.");
        if (!rbacUserRef.current) {
          setRbacUser(null);
        }
      } else {
        if (!rbacUserRef.current) {
          setRbacUser(null);
        }
        setError(err?.message || "Failed to fetch permissions");
      }
    } finally {
      setIsLoading(false);
    }
    })();

    inFlightRef.current = p;
    try {
      await p;
    } finally {
      if (inFlightRef.current === p) {
        inFlightRef.current = null;
      }
    }
  }, [getToken, isSignedIn, isLoaded, userType]);

  useEffect(() => {
    // Reset logout state when user is authenticated
    if (isSignedIn && isLoaded) {
      ApiService.setLoggingOut(false);
    }

    // Skip if we've already fetched for this user (prevent redundant fetches)
    if (userId && userId === lastFetchedUserIdRef.current && hasCompletedInitialFetchRef.current) {
      return;
    }

    // Skip if not signed in or not loaded
    if (!isSignedIn || !isLoaded) {
      return;
    }

    fetchPermissions();
  }, [isLoaded, isSignedIn, userId]);

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

  const isBranchAdmin = useMemo(() => rbacUser?.userType === "BRANCH_ADMIN", [rbacUser]);

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

export function usePermissions() {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error("usePermissions must be used within a PermissionProvider");
  }
  return ctx;
}
