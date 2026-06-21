import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
  requireBranchAdmin?: boolean;
  requireStaff?: boolean;
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  requireAdmin = false,
  requireSuperAdmin = false,
  requireBranchAdmin = false,
  requireStaff = false,
  redirectTo = "/",
}) => {
  const { isSignedIn, userRole, userType, orgRole, isLoading } = useAuth();
  const navigate = useNavigate();

  const rbacLoading =
    !!isSignedIn &&
    !isLoading &&
    ((requireSuperAdmin || requireBranchAdmin || requireStaff) && !userType ||
      (requireAdmin && !userRole));

  useEffect(() => {
    // Don't redirect while loading
    if (isLoading || rbacLoading) return;

    // Check if authentication is required
    if (requireAuth && !isSignedIn) {
      navigate(redirectTo);
      return;
    }

    // Check if admin role is required
    if (requireAdmin && userRole !== "ADMIN") {
      navigate(redirectTo);
      return;
    }

    // Check if SUPER_ADMIN is required
    if (requireSuperAdmin && userType !== "SUPER_ADMIN") {
      navigate(redirectTo);
      return;
    }

    // Check if BRANCH_ADMIN is required
    if (requireBranchAdmin && userType !== "BRANCH_ADMIN") {
      navigate(redirectTo);
      return;
    }

    // Check if staff is required (any staff type or org admin)
    if (requireStaff) {
      const isStaffType = ["SUPER_ADMIN", "BRANCH_ADMIN", "EMPLOYEE", "WAITER"].includes(userType || "");
      const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
      if (!isStaffType && !isOrgAdmin) {
        navigate(redirectTo);
        return;
      }
    }
  }, [
    isSignedIn,
    userRole,
    userType,
    orgRole,
    isLoading,
    rbacLoading,
    requireAuth,
    requireAdmin,
    requireSuperAdmin,
    requireBranchAdmin,
    requireStaff,
    redirectTo,
    navigate,
  ]);

  // Show loading while checking authentication
  if (isLoading || rbacLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render children if user doesn't meet requirements
  if (requireAuth && !isSignedIn) {
    return null;
  }

  if (requireAdmin && userRole !== "ADMIN") {
    return null;
  }

  if (requireSuperAdmin && userType !== "SUPER_ADMIN") {
    return null;
  }

  if (requireBranchAdmin && userType !== "BRANCH_ADMIN") {
    return null;
  }

  if (requireStaff) {
    const isStaffType = ["SUPER_ADMIN", "BRANCH_ADMIN", "EMPLOYEE", "WAITER"].includes(userType || "");
    const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
    if (!isStaffType && !isOrgAdmin) {
      return null;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
