import React, { useState, useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AdminSidebar from "./AdminSidebar";
import { SignedIn } from "@clerk/clerk-react";
import { LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import NotificationBell from "./NotificationBell";
import { AdminWebSocketProvider } from "../contexts/AdminWebSocketContext";
import LanguageSwitcher from "./LanguageSwitcher";
import branchService from "../services/branchService";
import OrganizationSearchSelect from "./OrganizationSearchSelect";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";

const AdminLayout: React.FC = () => {
  const { t } = useTranslation();
  const { user, userType, signOut, getToken } = useAuth();
  const { can, isSuperAdmin, isOrgAdmin } = usePermissions();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>("");
  const [navBusinessName, setNavBusinessName] = useState<string>("Bellami");

  const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
  const ORG_CHANGED_EVENT = "bellami:organizationChanged";

  const canAccessKitchen = isSuperAdmin || isOrgAdmin || can(RESOURCES.KITCHEN, ACTIONS.VIEW);
  const canAccessDispatch = isSuperAdmin || isOrgAdmin || can(RESOURCES.DISPATCH, ACTIONS.VIEW);
  const canAccessBar = isSuperAdmin || isOrgAdmin || can(RESOURCES.BAR, ACTIONS.VIEW);
  const canViewNotifications = can(RESOURCES.NOTIFICATIONS, ACTIONS.VIEW);

  useEffect(() => {
    const applyOrgId = (next: string | null | undefined) => {
      const normalized = String(next || "").trim();
      if (!normalized) return;
      setSelectedOrganizationId(normalized);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key !== ORG_STORAGE_KEY) return;
      applyOrgId(e.newValue);
    };

    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as any;
      applyOrgId(detail?.organizationId);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
    };
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  // Get user initials or avatar
  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
    }
    if (user?.emailAddresses?.[0]?.emailAddress) {
      return user.emailAddresses[0].emailAddress.charAt(0).toUpperCase();
    }
    return "A";
  };

  const getUserImageUrl = () => {
    return user?.imageUrl || null;
  };

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

        const savedId = (saved || "").trim();
        const defaultId = orgs?.[0]?.id ? String(orgs[0].id) : "";
        const nextId = savedId || defaultId;

        setSelectedOrganizationId(nextId);
        if (nextId && nextId !== savedId) {
          try {
            window.localStorage.setItem(ORG_STORAGE_KEY, nextId);
          } catch {
            // ignore
          }

          try {
            window.dispatchEvent(
              new CustomEvent(ORG_CHANGED_EVENT, {
                detail: { organizationId: nextId },
              })
            );
          } catch {
            // ignore
          }
        }
      } catch {
        // Don't block admin layout if orgs fail to load.
      }
    };

    loadOrganizations();
  }, [getToken, userType]);

  useEffect(() => {
    const loadBusinessName = async () => {
      const orgId = String(selectedOrganizationId || "").trim();
      if (!orgId) {
        setNavBusinessName("Bellami");
        return;
      }

      const localMatch = organizations.find((o) => String(o.id) === String(orgId));
      if (localMatch?.name) {
        setNavBusinessName(localMatch.name);
        return;
      }

      if (!isSuperAdmin && !isOrgAdmin) {
        setNavBusinessName("Bellami");
        return;
      }

      try {
        const token = await getToken();
        if (!token) return;
        const settings = await branchService.getOrganizationSettings(orgId, token);
        const businessName = (settings as any)?.businessName;
        setNavBusinessName(String(businessName || "Bellami"));
      } catch {
        setNavBusinessName("Bellami");
      }
    };

    loadBusinessName();
  }, [getToken, isOrgAdmin, isSuperAdmin, organizations, selectedOrganizationId]);

  return (
    <AdminWebSocketProvider>
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        backgroundColor: "#f9fafb",
        overflow: "hidden",
      }}
    >
      {/* Fixed Left Sidebar */}
      <AdminSidebar />

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Top Header */}
        <header
          style={{
            height: "72px",
            backgroundColor: "#ffffff",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            flexShrink: 0,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "20px",
                fontWeight: "600",
                color: "#111827",
                margin: 0,
              }}
            >
              {navBusinessName}
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <SignedIn>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                {/* Language Switcher */}
                <LanguageSwitcher />

                {canAccessKitchen ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const opener = window.electronAPI?.openKitchenWindow;
                        if (!opener) {
                          // eslint-disable-next-line no-alert
                          alert("Electron API not available (preload not loaded). Restart the desktop app.");
                          console.error("Kitchen opener missing: window.electronAPI.openKitchenWindow is undefined");
                          return;
                        }

                        const ok = await opener({});
                        if (!ok) {
                          console.error("openKitchenWindow returned false");
                        }
                      } catch {
                        console.error("Failed to open Kitchen window");
                      }
                    }}
                    style={{
                      padding: "0.55rem 0.9rem",
                      fontSize: "0.95rem",
                      cursor: "pointer",
                      backgroundColor: "#111827",
                      color: "white",
                      border: "none",
                      borderRadius: "0.5rem",
                      fontWeight: 600,
                      opacity: 0.92,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t("admin.kitchen.title", { defaultValue: "Kitchen" })}
                  </button>
                ) : null}

                {canAccessDispatch ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const opener = window.electronAPI?.openDispatchWindow;
                        if (!opener) {
                          // eslint-disable-next-line no-alert
                          alert("Electron API not available (preload not loaded). Restart the desktop app.");
                          console.error("Dispatch opener missing: window.electronAPI.openDispatchWindow is undefined");
                          return;
                        }

                        const ok = await opener({});
                        if (!ok) {
                          console.error("openDispatchWindow returned false");
                        }
                      } catch {
                        console.error("Failed to open Dispatch window");
                      }
                    }}
                    style={{
                      padding: "0.55rem 0.9rem",
                      fontSize: "0.95rem",
                      cursor: "pointer",
                      backgroundColor: "#111827",
                      color: "white",
                      border: "none",
                      borderRadius: "0.5rem",
                      fontWeight: 600,
                      opacity: 0.92,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Dispatch
                  </button>
                ) : null}

                {canAccessBar ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const opener = window.electronAPI?.openBarWindow;
                        if (!opener) {
                          // eslint-disable-next-line no-alert
                          alert("Electron API not available (preload not loaded). Restart the desktop app.");
                          console.error("Bar opener missing: window.electronAPI.openBarWindow is undefined");
                          return;
                        }

                        const ok = await opener({});
                        if (!ok) {
                          console.error("openBarWindow returned false");
                        }
                      } catch {
                        console.error("Failed to open Bar window");
                      }
                    }}
                    style={{
                      padding: "0.55rem 0.9rem",
                      fontSize: "0.95rem",
                      cursor: "pointer",
                      backgroundColor: "#111827",
                      color: "white",
                      border: "none",
                      borderRadius: "0.5rem",
                      fontWeight: 600,
                      opacity: 0.92,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t("admin.bar.title", { defaultValue: "Bar" })}
                  </button>
                ) : null}

                {userType === "SUPER_ADMIN" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label
                      htmlFor="org-switcher"
                      style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}
                    >
                      {t("admin.organization")}
                    </label>
                    <div style={{ width: "260px" }}>
                      <OrganizationSearchSelect
                        organizations={organizations}
                        value={selectedOrganizationId}
                        onValueChange={(next) => {
                          setSelectedOrganizationId(next);
                          try {
                            window.localStorage.setItem(ORG_STORAGE_KEY, next);
                          } catch {
                            // ignore
                          }

                          try {
                            window.dispatchEvent(
                              new CustomEvent(ORG_CHANGED_EVENT, {
                                detail: { organizationId: next },
                              })
                            );
                          } catch {
                            // ignore
                          }
                        }}
                        placeholder={t("common.select")}
                        searchPlaceholder={t("common.search")}
                        noResultsText={t("common.noResults")}
                      />
                    </div>
                  </div>
                ) : null}
                
                {/* Notification Bell */}
                {canViewNotifications ? <NotificationBell /> : null}
                <div style={{ position: "relative" }} ref={menuRef}>
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)",
                      background: "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)",
                      color: "#ffffff",
                      fontSize: "14px",
                      fontWeight: "600",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.9";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    {getUserImageUrl() ? (
                      <img
                        src={getUserImageUrl()!}
                        alt="User avatar"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      getUserInitials()
                    )}
                  </button>

                  {/* Dropdown Menu */}
                  {isMenuOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        marginTop: "8px",
                        width: "200px",
                        backgroundColor: "#ffffff",
                        borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                        border: "1px solid #e5e7eb",
                        zIndex: 1000,
                        overflow: "hidden",
                      }}
                    >
                      <button
                        onClick={() => {
                          signOut();
                          setIsMenuOpen(false);
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px 16px",
                          fontSize: "14px",
                          fontWeight: "500",
                          color: "#dc2626",
                          backgroundColor: "transparent",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#fef2f2";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <LogOut style={{ height: "18px", width: "18px", flexShrink: 0 }} />
                        <span>{t("admin.sidebar.logout")}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </SignedIn>
          </div>
        </header>

        {/* Page Content */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
            backgroundColor: "#f9fafb",
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
    </AdminWebSocketProvider>
  );
};

export default AdminLayout;

