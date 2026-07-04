import React, { useEffect, useLayoutEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import NotificationBell from "@/components/NotificationBell";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Toaster } from "@/components/ui/sonner";
import { AdminWebSocketProvider } from "@/contexts/AdminWebSocketContext";
import { useTranslation } from "react-i18next";
import branchService from "@/services/branchService";
import type { Organization } from "@/services/branchService";
import OrganizationSearchSelect from "@/components/OrganizationSearchSelect";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";

const AdminHeaderActions: React.FC<{ isSidebarOpen: boolean; user?: any }> = ({
  isSidebarOpen,
  user,
}) => {
  const { can } = usePermissions();
  const canViewNotifications = can(RESOURCES.NOTIFICATIONS, ACTIONS.VIEW);

  return (
    <div
      className={`flex items-center gap-2 transition-all duration-300 ${
        isSidebarOpen ? "opacity-50 blur-sm" : ""
      }`}
    >
      <LanguageSwitcher />
      {canViewNotifications ? <NotificationBell /> : null}
      <Avatar className="h-8 w-8">
        <AvatarImage src={user?.imageUrl} />
        <AvatarFallback className="bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs">
          {user?.firstName?.charAt(0) || "A"}
        </AvatarFallback>
      </Avatar>
    </div>
  );
};

const AdminLayoutInner: React.FC = () => {
  const { user } = useAuth();
  const { userType, getToken } = useAuth();
  const { t } = useTranslation();
  const { isSuperAdmin, rbacUser } = usePermissions();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>("");
  const [faviconHref, setFaviconHref] = useState<string>("");
  const navigate = useNavigate();
  const location = useLocation();

  const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";

  useEffect(() => {
    const checkSetup = async () => {
      if (userType !== "SUPER_ADMIN") return;
      if (location.pathname === "/admin/setup") return;

      try {
        const token = await getToken();
        if (!token) return;
        const unassigned = await branchService.getUnassignedBranches(token);
        if (Array.isArray(unassigned) && unassigned.length > 0) {
          navigate("/admin/setup", { replace: true });
        }
      } catch {
        // If the check fails, don't block admin navigation.
      }
    };

    checkSetup();
  }, [getToken, location.pathname, navigate, userType]);

  useEffect(() => {
    const loadOrganizations = async () => {
      if (userType !== "SUPER_ADMIN") return;
      try {
        const token = await getToken();
        if (!token) return;
        const orgs = await branchService.getOrganizations(token);
        setOrganizations(orgs || []);

        const saved =
          typeof window !== "undefined"
            ? window.localStorage.getItem(ORG_STORAGE_KEY)
            : null;
        setSelectedOrganizationId((saved || "").trim());
      } catch {
        // Don't block admin layout if orgs fail to load.
      }
    };

    loadOrganizations();
  }, [getToken, userType]);

  const selectedOrgName =
    organizations.find((o) => o.id === selectedOrganizationId)?.name || "";

  // Remove any existing favicon tags immediately when entering admin to avoid a flash of a default icon.
  useLayoutEffect(() => {
    try {
      document
        .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
        .forEach((n) => n.parentNode?.removeChild(n));
    } catch {
      // ignore
    }
  }, []);

  const faviconOrganizationId = (() => {
    if (isSuperAdmin) return selectedOrganizationId;
    const id = (rbacUser as any)?.organizationId as string | null | undefined;
    return id && String(id).trim().length > 0 ? String(id).trim() : "";
  })();

  const canLoadOrganizationFavicon = (() => {
    if (isSuperAdmin) return true;
    const orgRole = (rbacUser as any)?.orgRole as string | null | undefined;
    return orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
  })();

  useEffect(() => {
    const loadFavicon = async () => {
      try {
        if (!faviconOrganizationId) return;
        if (!canLoadOrganizationFavicon) return;

        const token = await getToken();
        if (!token) return;

        const settings = await branchService.getOrganizationSettings(faviconOrganizationId, token);
        const businessLogo = (settings as any)?.businessLogo as string | null | undefined;

        // No fallback icon: only update the favicon if the organization has a real logo.
        if (!businessLogo || !String(businessLogo).trim()) return;

        const href = isExternalImage(businessLogo)
          ? businessLogo
          : getOptimizedImageUrl(businessLogo, "thumbnail");

        setFaviconHref(href || "");
      } catch {
        // No fallback
      }
    };

    loadFavicon();
  }, [canLoadOrganizationFavicon, faviconOrganizationId, getToken]);

  useEffect(() => {
    const rawHref = (faviconHref || "").trim();
    if (!rawHref) return;
    const cacheBustedHref = rawHref.startsWith("data:")
      ? rawHref
      : `${rawHref}${rawHref.includes("?") ? "&" : "?"}v=${encodeURIComponent(
          faviconOrganizationId || "default"
        )}`;

    try {
      document
        .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
        .forEach((n) => n.parentNode?.removeChild(n));

      const create = (rel: string) => {
        const el = document.createElement("link");
        el.rel = rel;
        el.href = cacheBustedHref;
        document.head.appendChild(el);
      };

      create("icon");
      create("shortcut icon");
      create("apple-touch-icon");
    } catch {
      // ignore
    }
  }, [faviconHref, faviconOrganizationId]);

  const isIOS =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

  const globalAllowedPrefixes = ["/admin/setup", "/admin/organizations"];
  const isGlobalAllowed = globalAllowedPrefixes.some((p) =>
    location.pathname.startsWith(p)
  );

  const needsOrganizationSelection =
    isSuperAdmin && !selectedOrganizationId && location.pathname.startsWith("/admin") && !isGlobalAllowed;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header
        className={
          isIOS
            ? "sticky top-0 z-20 bg-background/95 border-b border-border"
            : "sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border"
        }
      >
        <div className="max-w-4xl mx-auto px-4 py-3 relative">
          <div className="space-y-3 sm:space-y-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Mobile Menu Button */}
                <AdminSidebar onToggle={setIsSidebarOpen} />

                {/* Title */}
                <h1 className="text-lg font-semibold text-pink-500 whitespace-nowrap">
                  {t("admin.panel")}
                </h1>

                {isSuperAdmin && (
                  <div className="hidden sm:flex items-center gap-2 min-w-0">
                    <div className="px-2 py-1 rounded-md border border-pink-500/30 bg-pink-500/10 text-xs text-pink-600 dark:text-pink-300 truncate">
                      {selectedOrganizationId
                        ? `Org: ${selectedOrgName || selectedOrganizationId}`
                        : "Global"}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                {userType === "SUPER_ADMIN" && (
                  <div className="hidden sm:block w-[240px]">
                    <OrganizationSearchSelect
                      organizations={organizations}
                      value={selectedOrganizationId}
                      onValueChange={(val) => {
                        setSelectedOrganizationId(val);
                        try {
                          window.localStorage.setItem(ORG_STORAGE_KEY, val);
                        } catch {
                          // ignore
                        }
                        window.location.assign("/admin");
                      }}
                      placeholder={t("admin.selectOrganization", {
                        defaultValue: "Select organization",
                      })}
                    />
                  </div>
                )}

                {/* Right Side Actions */}
                <AdminHeaderActions isSidebarOpen={isSidebarOpen} user={user} />
              </div>
            </div>

            {isSuperAdmin && (
              <div className="flex items-center justify-between gap-3 sm:hidden">
                <div className="px-2 py-1 rounded-md border border-pink-500/30 bg-pink-500/10 text-xs text-pink-600 dark:text-pink-300 truncate">
                  {selectedOrganizationId
                    ? `Org: ${selectedOrgName || selectedOrganizationId}`
                    : "Global"}
                </div>

                {userType === "SUPER_ADMIN" && (
                  <div className="flex-1">
                    <OrganizationSearchSelect
                      organizations={organizations}
                      value={selectedOrganizationId}
                      onValueChange={(val) => {
                        setSelectedOrganizationId(val);
                        try {
                          window.localStorage.setItem(ORG_STORAGE_KEY, val);
                        } catch {
                          // ignore
                        }
                        window.location.assign("/admin");
                      }}
                      placeholder={t("admin.selectOrganization", {
                        defaultValue: "Select organization",
                      })}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Page Content - Centered */}
      <main
        className={`max-w-4xl mx-auto px-4 py-6 transition-all duration-300 ${
          isSidebarOpen ? "blur-sm" : ""
        }`}
      >
        {needsOrganizationSelection ? (
          <div className="rounded-lg border border-pink-500/20 bg-pink-500/5 p-4">
            <div className="text-sm font-medium text-pink-600 dark:text-pink-300">
              {t("admin.selectOrganizationRequired", {
                defaultValue: "Select an organization to continue.",
              })}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t("admin.selectOrganizationRequiredHint", {
                defaultValue:
                  "Use the organization selector in the header. Some admin pages are scoped and cannot be viewed in global mode.",
              })}
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* Toast notifications for admin pages */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "linear-gradient(135deg, #1a1a1a 0%, #262626 100%)",
            color: "#ffffff",
            border: "1px solid #404040",
            borderRadius: "12px",
            boxShadow:
              "0 10px 25px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(236, 72, 153, 0.1)",
            backdropFilter: "blur(10px)",
          },
          className: "toast-notification",
        }}
        richColors
        closeButton
        expand
        duration={4000}
      />
    </div>
  );
};

const AdminLayout: React.FC = () => {
  return (
    <AdminWebSocketProvider>
      <AdminLayoutInner />
    </AdminWebSocketProvider>
  );
};

export default AdminLayout;
