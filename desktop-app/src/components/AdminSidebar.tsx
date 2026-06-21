import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "@mdi/react";
import {
  mdiViewDashboard,
  mdiAccountGroup,
  mdiClipboardListOutline,
  mdiFood,
  mdiShape,
  mdiPlusBoxMultiple,
  mdiTagMultiple,
  mdiFoodVariant,
  mdiPackageVariant,
  mdiOfficeBuilding,
  mdiCalendarClock,
  mdiTableFurniture,
  mdiMapMarkerRadius,
  mdiGrid,
  mdiStore,
  mdiScale,
  mdiImageMultiple,
  mdiChartBar,
  mdiChartPie,
  mdiChartTimelineVariant,
  mdiCog,
  mdiBell,
  mdiCalendarCheckOutline,
  mdiCalendarMultiple,
  mdiFileDocumentOutline,
  mdiCalendarEdit,
  mdiShield,
  mdiClipboardTextClockOutline,
  mdiChevronDown,
  mdiChevronRight,
  mdiLogout,
} from "@mdi/js";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";

interface MenuItem {
  title: string;
  path: string;
  iconPath: string;
}

interface MenuSection {
  title?: string;
  groups?: Array<{ id: string; title: string; items: MenuItem[] }>;
  items: MenuItem[];
}

const EXPANDED_GROUPS_STORAGE_KEY = "bellami:adminSidebarExpandedGroups";

const AdminSidebar: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user, userType } = useAuth();
  const { rbacUser, isSuperAdmin, isOrgAdmin, can, canAny } = usePermissions();

  const reservationEntitled =
    isSuperAdmin || userType === "SUPER_ADMIN"
      ? true
      : (rbacUser as any)?.organizationEntitlements?.reservationsAllowed !== false;

  const canView = (resource: keyof typeof RESOURCES) => {
    return can(RESOURCES[resource], ACTIONS.VIEW);
  };

  const canViewAny = (resources: Array<keyof typeof RESOURCES>) => {
    return canAny(resources.map((r) => ({ resource: RESOURCES[r], action: ACTIONS.VIEW })));
  };

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
    return (user as any)?.imageUrl || null;
  };

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = window.localStorage.getItem(EXPANDED_GROUPS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed as Record<string, boolean>;
    } catch {
      return {};
    }
  });

  const getMenuItemTitle = (path: string): string => {
    const titleMap: Record<string, string> = {
      "/admin": "admin.dashboard.title",

      "/admin/orders": "admin.orderManagement.title",
      "/admin/reservations": "admin.reservationManagement.title",

      "/admin/menu": "admin.menuManagement.title",
      "/admin/deals": "admin.dealManagement.title",
      "/admin/categories": "admin.categoryManagement.title",
      "/admin/addons": "admin.addonManagement.title",
      "/admin/optional-ingredients": "admin.sidebar.menuItems.optionalIngredients",
      "/admin/declarations": "admin.declarationManagement.title",

      "/admin/reservations/tables": "admin.tableManagement.title",
      "/admin/zones": "admin.zoneManagement.title",
      "/admin/reservations/tables/status-grid": "admin.tableStatusGrid.title",

      "/admin/users": "admin.userManagement.title",
      "/admin/staff": "admin.staffManagement.title",
      "/admin/roles": "admin.roleManagement.title",

      "/admin/branches": "admin.branchManagement.title",
      "/admin/business-day": "admin.businessDay.endOfDayTitle",
      "/admin/business-day/closed": "admin.businessDayClosedDays.title",
      "/admin/deliverable-quantities": "admin.deliverableQuantities.title",

      "/admin/hero-section": "admin.heroSection.title",

      "/admin/analytics": "admin.revenueAnalytics.title",
      "/admin/insights": "admin.categoryInsights.title",
      "/admin/reservations/analytics": "admin.reservationAnalytics.title",

      "/admin/organizations": "admin.organizations.title",
      "/admin/settings": "admin.settings.title",
      "/admin/audit-logs": "admin.auditLogs.title",
      "/admin/reservations/settings": "admin.reservationSettings.title",
      "/admin/push-notifications": "admin.pushNotifications.title",
      "/admin/terms-and-policies": "admin.termsAndPolicies.title",
    };
    return t(titleMap[path] || path);
  };

  const isRouteActive = (href: string) => location.pathname === href;
  const groupHasActiveRoute = (items: MenuItem[]) => items.some((item) => isRouteActive(item.path));

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        window.localStorage.setItem(EXPANDED_GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const menuSections: MenuSection[] = useMemo(() => {
    const sections: MenuSection[] = [
      {
        items: [
          ...(canView("DASHBOARD")
            ? [
                {
                  title: getMenuItemTitle("/admin"),
                  path: "/admin",
                  iconPath: mdiViewDashboard,
                },
              ]
            : []),
        ],
      },
      {
        title: t("admin.sidebar.sections.management"),
        items: [],
        groups: [
          {
            id: "orders",
            title: t("admin.sidebar.groups.orders"),
            items: [
              ...(canView("ORDERS")
                ? [
                    {
                      title: getMenuItemTitle("/admin/orders"),
                      path: "/admin/orders",
                      iconPath: mdiClipboardListOutline,
                    },
                  ]
                : []),
              ...(reservationEntitled && canView("RESERVATIONS")
                ? [
                    {
                      title: getMenuItemTitle("/admin/reservations"),
                      path: "/admin/reservations",
                      iconPath: mdiCalendarClock,
                    },
                  ]
                : []),
            ],
          },
          {
            id: "menu",
            title: t("admin.sidebar.groups.menu"),
            items: [
              ...(canView("MENU")
                ? [
                    {
                      title: getMenuItemTitle("/admin/menu"),
                      path: "/admin/menu",
                      iconPath: mdiFood,
                    },
                  ]
                : []),
              ...(canView("DEALS")
                ? [
                    {
                      title: getMenuItemTitle("/admin/deals"),
                      path: "/admin/deals",
                      iconPath: mdiPackageVariant,
                    },
                  ]
                : []),
              ...(canView("CATEGORIES")
                ? [
                    {
                      title: getMenuItemTitle("/admin/categories"),
                      path: "/admin/categories",
                      iconPath: mdiShape,
                    },
                  ]
                : []),
              ...(canView("ADDONS")
                ? [
                    {
                      title: getMenuItemTitle("/admin/addons"),
                      path: "/admin/addons",
                      iconPath: mdiPlusBoxMultiple,
                    },
                  ]
                : []),
              ...(canView("MEALS")
                ? [
                    {
                      title: getMenuItemTitle("/admin/optional-ingredients"),
                      path: "/admin/optional-ingredients",
                      iconPath: mdiFoodVariant,
                    },
                  ]
                : []),
              ...(canView("DECLARATIONS")
                ? [
                    {
                      title: getMenuItemTitle("/admin/declarations"),
                      path: "/admin/declarations",
                      iconPath: mdiTagMultiple,
                    },
                  ]
                : []),
            ],
          },
          ...(reservationEntitled
            ? [
                {
                  id: "tables",
                  title: t("admin.sidebar.groups.tables"),
                  items: [
                    ...(canView("TABLES")
                      ? [
                          {
                            title: getMenuItemTitle("/admin/reservations/tables"),
                            path: "/admin/reservations/tables",
                            iconPath: mdiTableFurniture,
                          },
                        ]
                      : []),
                    ...(canView("ZONES")
                      ? [
                          {
                            title: getMenuItemTitle("/admin/zones"),
                            path: "/admin/zones",
                            iconPath: mdiMapMarkerRadius,
                          },
                        ]
                      : []),
                    ...(canView("TABLE_STATUS_GRID")
                      ? [
                          {
                            title: getMenuItemTitle("/admin/reservations/tables/status-grid"),
                            path: "/admin/reservations/tables/status-grid",
                            iconPath: mdiGrid,
                          },
                        ]
                      : []),
                  ],
                },
              ]
            : []),
          {
            id: "people",
            title: t("admin.sidebar.groups.people"),
            items: [
              ...(userType === "BRANCH_ADMIN"
                ? [
                    {
                      title: t("admin.myStaff.title", { defaultValue: "My Staff" }),
                      path: "/admin/my-staff",
                      iconPath: mdiAccountGroup,
                    },
                  ]
                : []),
              ...(userType === "SUPER_ADMIN"
                ? [
                    {
                      title: getMenuItemTitle("/admin/users"),
                      path: "/admin/users",
                      iconPath: mdiAccountGroup,
                    },
                    {
                      title: getMenuItemTitle("/admin/staff"),
                      path: "/admin/staff",
                      iconPath: mdiAccountGroup,
                    },
                    {
                      title: getMenuItemTitle("/admin/roles"),
                      path: "/admin/roles",
                      iconPath: mdiShield,
                    },
                  ]
                : []),
              ...(userType !== "SUPER_ADMIN" && isOrgAdmin
                ? [
                    {
                      title: getMenuItemTitle("/admin/staff"),
                      path: "/admin/staff",
                      iconPath: mdiAccountGroup,
                    },
                    {
                      title: getMenuItemTitle("/admin/roles"),
                      path: "/admin/roles",
                      iconPath: mdiShield,
                    },
                  ]
                : []),
            ],
          },
          {
            id: "branches",
            title: t("admin.sidebar.groups.branches"),
            items: [
              ...(canView("BRANCHES")
                ? [
                    {
                      title: getMenuItemTitle("/admin/branches"),
                      path: "/admin/branches",
                      iconPath: mdiStore,
                    },
                  ]
                : []),
              ...((canView("END_OF_DAY") || canView("REPORTS"))
                ? [
                    {
                      title: getMenuItemTitle("/admin/business-day"),
                      path: "/admin/business-day",
                      iconPath: mdiCalendarCheckOutline,
                    },
                  ]
                : []),
              ...((canView("CLOSED_DAYS") || canView("REPORTS"))
                ? [
                    {
                      title: getMenuItemTitle("/admin/business-day/closed"),
                      path: "/admin/business-day/closed",
                      iconPath: mdiCalendarMultiple,
                    },
                  ]
                : []),
              ...(canAny([
                { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.VIEW },
                { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.MANAGE },
              ])
                ? [
                    {
                      title: getMenuItemTitle("/admin/deliverable-quantities"),
                      path: "/admin/deliverable-quantities",
                      iconPath: mdiScale,
                    },
                  ]
                : []),
            ],
          },
        ],
      },
      {
        title: t("admin.sidebar.sections.content"),
        items: [
          ...(canView("HERO_SECTIONS")
            ? [
                {
                  title: getMenuItemTitle("/admin/hero-section"),
                  path: "/admin/hero-section",
                  iconPath: mdiImageMultiple,
                },
              ]
            : []),
        ],
      },
      {
        title: t("admin.sidebar.sections.analytics"),
        items: [
          ...(canViewAny(["ANALYTICS_REVENUE", "ANALYTICS"])
            ? [
                {
                  title: getMenuItemTitle("/admin/analytics"),
                  path: "/admin/analytics",
                  iconPath: mdiChartBar,
                },
              ]
            : []),
          ...(canViewAny(["ANALYTICS_CATEGORY_INSIGHTS", "ANALYTICS"])
            ? [
                {
                  title: getMenuItemTitle("/admin/insights"),
                  path: "/admin/insights",
                  iconPath: mdiChartPie,
                },
              ]
            : []),
          ...(reservationEntitled && canViewAny(["ANALYTICS_RESERVATION", "ANALYTICS"])
            ? [
                {
                  title: getMenuItemTitle("/admin/reservations/analytics"),
                  path: "/admin/reservations/analytics",
                  iconPath: mdiChartTimelineVariant,
                },
              ]
            : []),
        ],
      },
      {
        title: t("admin.sidebar.sections.system"),
        items: [
          ...(isSuperAdmin
            ? [
                {
                  title: getMenuItemTitle("/admin/organizations"),
                  path: "/admin/organizations",
                  iconPath: mdiOfficeBuilding,
                },
              ]
            : []),
          ...((isSuperAdmin || isOrgAdmin)
            ? [
                {
                  title: getMenuItemTitle("/admin/settings"),
                  path: "/admin/settings",
                  iconPath: mdiCog,
                },
                {
                  title: getMenuItemTitle("/admin/audit-logs"),
                  path: "/admin/audit-logs",
                  iconPath: mdiClipboardTextClockOutline,
                },
                ...(reservationEntitled
                  ? [
                      {
                        title: getMenuItemTitle("/admin/reservations/settings"),
                        path: "/admin/reservations/settings",
                        iconPath: mdiCalendarEdit,
                      },
                    ]
                  : []),
              ]
            : []),
          ...(isSuperAdmin
            ? [
                {
                  title: getMenuItemTitle("/admin/push-notifications"),
                  path: "/admin/push-notifications",
                  iconPath: mdiBell,
                },
                {
                  title: getMenuItemTitle("/admin/terms-and-policies"),
                  path: "/admin/terms-and-policies",
                  iconPath: mdiFileDocumentOutline,
                },
              ]
            : []),
        ],
      },
    ];

    return sections
      .map((section) => {
        const nextGroups = section.groups?.filter((g) => Array.isArray(g.items) && g.items.length > 0);
        return {
          ...section,
          groups: nextGroups,
        };
      })
      .filter((section) => {
        const hasItems = Array.isArray(section.items) && section.items.length > 0;
        const hasGroups = Array.isArray(section.groups) && section.groups.length > 0;
        return hasItems || hasGroups;
      });
  }, [canAny, isOrgAdmin, isSuperAdmin, rbacUser, reservationEntitled, t, userType]);

  // Auto-expand the active group (do not auto-collapse others)
  useEffect(() => {
    const activeGroupIds: string[] = [];
    for (const section of menuSections) {
      if (!section.groups) continue;
      for (const group of section.groups) {
        if (groupHasActiveRoute(group.items)) {
          activeGroupIds.push(group.id);
        }
      }
    }

    if (activeGroupIds.length === 0) return;
    setExpandedGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of activeGroupIds) {
        if (!next[id]) {
          next[id] = true;
          changed = true;
        }
      }
      if (changed) {
        try {
          window.localStorage.setItem(EXPANDED_GROUPS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return changed ? next : prev;
    });
  }, [location.pathname, menuSections]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "260px",
        backgroundColor: "#ffffff",
        borderRight: "1px solid #e5e7eb",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "20px 16px",
          borderBottom: "1px solid #e5e7eb",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            height: "32px",
            width: "32px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon path={mdiCog} size={0.7} style={{ color: "white" }} />
        </div>
        <span
          style={{
            fontSize: "18px",
            fontWeight: "600",
            color: "#111827",
          }}
        >
          {t("admin.sidebar.adminPanel")}
        </span>
      </div>

      {/* Navigation - Scrollable */}
      <nav
        style={{
          flex: 1,
          padding: "16px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {menuSections.map((section, sectionIndex) => (
          <div key={sectionIndex} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {section.title && (
              <div style={{ padding: "0 12px 4px 12px" }}>
                <h3
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {section.title}
                </h3>
              </div>
            )}

            {section.groups ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {section.groups.map((group) => (
                  <div key={group.title} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {(() => {
                      const isExpanded = expandedGroups[group.id] ?? true;
                      const chevronPath = isExpanded ? mdiChevronDown : mdiChevronRight;

                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.id)}
                            style={{
                              padding: "0 12px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>
                              {group.title}
                            </div>
                            <Icon path={chevronPath} size={0.6} style={{ color: "#6b7280" }} />
                          </button>

                          {isExpanded ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              {group.items.map((item) => {
                                const iconPath = item.iconPath;
                                const isActive = location.pathname === item.path;

                                return (
                                  <button
                                    key={item.path}
                                    onClick={() => navigate(item.path)}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "12px",
                                      borderRadius: "8px",
                                      padding: "10px 12px",
                                      fontSize: "14px",
                                      fontWeight: isActive ? "500" : "400",
                                      cursor: "pointer",
                                      border: "none",
                                      backgroundColor: isActive ? "#fce7f3" : "transparent",
                                      color: isActive ? "#ec4899" : "#374151",
                                      transition: "all 0.2s",
                                      textAlign: "left",
                                      width: "100%",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isActive) {
                                        e.currentTarget.style.backgroundColor = "#f9fafb";
                                        e.currentTarget.style.color = "#111827";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isActive) {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                        e.currentTarget.style.color = "#374151";
                                      }
                                    }}
                                  >
                                    <Icon
                                      path={iconPath}
                                      size={0.75}
                                      style={{
                                        flexShrink: 0,
                                        color: isActive ? "#ec4899" : "#6b7280",
                                      }}
                                    />
                                    <span style={{ whiteSpace: "nowrap" }}>{item.title}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {section.items.map((item) => {
                  const iconPath = item.iconPath;
                  const isActive = location.pathname === item.path;

                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        fontSize: "14px",
                        fontWeight: isActive ? "500" : "400",
                        cursor: "pointer",
                        border: "none",
                        backgroundColor: isActive ? "#fce7f3" : "transparent",
                        color: isActive ? "#ec4899" : "#374151",
                        transition: "all 0.2s",
                        textAlign: "left",
                        width: "100%",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = "#f9fafb";
                          e.currentTarget.style.color = "#111827";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.color = "#374151";
                        }
                      }}
                    >
                      <Icon
                        path={iconPath}
                        size={0.75}
                        style={{
                          flexShrink: 0,
                          color: isActive ? "#ec4899" : "#6b7280",
                        }}
                      />
                      <span style={{ whiteSpace: "nowrap" }}>{item.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: "16px",
          borderTop: "1px solid #e5e7eb",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {/* Admin User Info */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "8px",
            borderRadius: "8px",
            backgroundColor: "#f9fafb",
          }}
        >
          <div
            style={{
              height: "32px",
              width: "32px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
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
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "white",
                }}
              >
                {getUserInitials()}
              </span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: "14px",
                fontWeight: "500",
                color: "#111827",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.firstName && user?.lastName
                ? `${user.firstName} ${user.lastName}`
                : user?.emailAddresses?.[0]?.emailAddress || "Admin User"}
            </p>
            <p
              style={{
                fontSize: "12px",
                color: "#6b7280",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.emailAddresses?.[0]?.emailAddress || "admin@example.com"}
            </p>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={() => signOut()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            borderRadius: "8px",
            padding: "10px 12px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer",
            border: "none",
            backgroundColor: "transparent",
            color: "#dc2626",
            transition: "all 0.2s",
            textAlign: "left",
            width: "100%",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#fef2f2";
            e.currentTarget.style.color = "#b91c1c";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "#dc2626";
          }}
        >
          <Icon path={mdiLogout} size={0.75} style={{ flexShrink: 0 }} />
          <span>{t("admin.sidebar.logout")}</span>
        </button>
      </div>
    </div>
  );
};

export default AdminSidebar;

