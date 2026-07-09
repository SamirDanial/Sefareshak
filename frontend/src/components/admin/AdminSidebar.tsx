import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@mdi/react";
import {
  mdiMenu,
  mdiViewDashboard,
  mdiAccountGroup,
  mdiAccountTie,
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
  mdiClose,
  mdiLogout,
  mdiArrowLeft,
} from "@mdi/js";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import { useTranslation } from "react-i18next";

interface AdminSidebarProps {
  onToggle?: (isOpen: boolean) => void;
}

interface MenuItem {
  titleKey?: string;
  title?: string;
  href: string;
  iconPath: string;
}

interface MenuSection {
  titleKey?: string;
  items: MenuItem[];
  groups?: Array<{
    id: string;
    titleKey: string;
    iconPath: string;
    items: MenuItem[];
  }>;
}

const EXPANDED_GROUPS_STORAGE_KEY = "bellami:adminSidebarExpandedGroups";

const AdminSidebar: React.FC<AdminSidebarProps> = ({ onToggle }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userType, orgRole, signOut } = useAuth();
  const { rbacUser, can, canAny, isSuperAdmin, isOrgAdmin } = usePermissions();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      if (typeof window === "undefined") return {};
      const raw = window.localStorage.getItem(EXPANDED_GROUPS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const navRef = useRef<HTMLElement | null>(null);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');

  useEffect(() => {
    const updateDirection = () => {
      setDirection(document.documentElement.dir as 'ltr' | 'rtl');
    };
    
    updateDirection();
    
    const observer = new MutationObserver(updateDirection);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
    
    return () => observer.disconnect();
  }, []);

  const canView = useCallback(
    (resource: keyof typeof RESOURCES) => {
      return can(RESOURCES[resource], ACTIONS.VIEW);
    },
    [can]
  );

  const isRouteActive = useCallback(
    (href: string) => location.pathname === href,
    [location.pathname]
  );

  const hasActiveRoute = useCallback(
    (items: MenuItem[]) => items.some((item) => isRouteActive(item.href)),
    [isRouteActive]
  );

  const canViewAny = useCallback(
    (resources: Array<keyof typeof RESOURCES>) => {
      return canAny(resources.map((r) => ({ resource: RESOURCES[r], action: ACTIONS.VIEW })));
    },
    [canAny]
  );

  const reservationEntitled =
    isSuperAdmin || userType === "SUPER_ADMIN"
      ? true
      : (rbacUser as any)?.organizationEntitlements?.reservationsAllowed !== false;

  const menuSections: MenuSection[] = useMemo(
    () => [
    {
      items: [
        ...(canView("DASHBOARD")
          ? [
              {
                titleKey: "admin.dashboard.title",
                href: "/admin",
                iconPath: mdiViewDashboard, // view-dashboard
              },
            ]
          : []),
      ],
    },
    {
      titleKey: "admin.sidebar.management",
      items: [],
      groups: [
        {
          id: "orders",
          titleKey: "admin.sidebar.groups.orders",
          iconPath: mdiClipboardListOutline,
          items: [
            ...(canView("ORDERS")
              ? [
                  {
                    titleKey: "admin.orderManagement.title",
                    href: "/admin/orders",
                    iconPath: mdiClipboardListOutline,
                  },
                ]
              : []),
            ...(reservationEntitled && canView("RESERVATIONS")
              ? [
                  {
                    titleKey: "admin.reservationManagement.title",
                    href: "/admin/reservations",
                    iconPath: mdiCalendarClock,
                  },
                ]
              : []),
          ],
        },
        {
          id: "menu",
          titleKey: "admin.sidebar.groups.menu",
          iconPath: mdiFood,
          items: [
            ...(canView("MENU")
              ? [
                  {
                    titleKey: "admin.menuManagement.title",
                    href: "/admin/menu",
                    iconPath: mdiFood,
                  },
                ]
              : []),
            ...(canView("DEALS")
              ? [
                  {
                    titleKey: "admin.dealManagement.title",
                    href: "/admin/deals",
                    iconPath: mdiPackageVariant,
                  },
                ]
              : []),
            ...(canView("CATEGORIES")
              ? [
                  {
                    titleKey: "admin.categoryManagement.title",
                    href: "/admin/categories",
                    iconPath: mdiShape,
                  },
                ]
              : []),
            ...(canView("ADDONS")
              ? [
                  {
                    titleKey: "admin.addonManagement.title",
                    href: "/admin/addons",
                    iconPath: mdiPlusBoxMultiple,
                  },
                ]
              : []),
            ...(canView("MEALS")
              ? [
                  {
                    titleKey: "admin.optionalIngredientManagement.title",
                    href: "/admin/optional-ingredients",
                    iconPath: mdiFoodVariant,
                  },
                ]
              : []),
            ...(canView("DECLARATIONS")
              ? [
                  {
                    titleKey: "admin.declarationManagement.title",
                    href: "/admin/declarations",
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
                titleKey: "admin.sidebar.groups.tables",
                iconPath: mdiTableFurniture,
                items: [
                  ...(canView("TABLES")
                    ? [
                        {
                          titleKey: "admin.tableManagement.title",
                          href: "/admin/reservations/tables",
                          iconPath: mdiTableFurniture,
                        },
                      ]
                    : []),
                  ...(canView("ZONES")
                    ? [
                        {
                          titleKey: "admin.zoneManagement.title",
                          href: "/admin/zones",
                          iconPath: mdiMapMarkerRadius,
                        },
                      ]
                    : []),
                  ...(canView("TABLE_STATUS_GRID")
                    ? [
                        {
                          titleKey: "admin.tableStatusGrid.title",
                          href: "/admin/reservations/tables/status-grid",
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
          titleKey: "admin.sidebar.groups.people",
          iconPath: mdiAccountGroup,
          items: [
            ...(userType === "BRANCH_ADMIN"
              ? [
                  {
                    titleKey: "admin.myStaff.title",
                    href: "/admin/my-staff",
                    iconPath: mdiAccountGroup,
                  },
                ]
              : []),
            ...(userType === "SUPER_ADMIN"
              ? [
                  {
                    titleKey: "admin.userManagement.title",
                    href: "/admin/users",
                    iconPath: mdiAccountGroup,
                  },
                  {
                    titleKey: "admin.staffManagement.title",
                    href: "/admin/staff",
                    iconPath: mdiAccountTie,
                  },
                  {
                    titleKey: "admin.roleManagement.title",
                    href: "/admin/roles",
                    iconPath: mdiShield,
                  },
                ]
              : []),
            ...(userType !== "SUPER_ADMIN" && (orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN")
              ? [
                  {
                    titleKey: "admin.staffManagement.title",
                    href: "/admin/staff",
                    iconPath: mdiAccountTie,
                  },
                  {
                    titleKey: "admin.roleManagement.title",
                    href: "/admin/roles",
                    iconPath: mdiShield,
                  },
                ]
              : []),
          ],
        },
        {
          id: "branches",
          titleKey: "admin.sidebar.groups.branches",
          iconPath: mdiStore,
          items: [
            ...(canView("BRANCHES")
              ? [
                  {
                    titleKey: "admin.branchManagement.title",
                    href: "/admin/branches",
                    iconPath: mdiStore,
                  },
                ]
              : []),
            ...((canView("END_OF_DAY") || canView("REPORTS"))
              ? [
                  {
                    titleKey: "admin.businessDay.endOfDayTitle",
                    href: "/admin/business-day",
                    iconPath: mdiCalendarCheckOutline,
                  },
                ]
              : []),
            ...((canView("CLOSED_DAYS") || canView("REPORTS"))
              ? [
                  {
                    titleKey: "admin.businessDayClosedDays.title",
                    href: "/admin/business-day/closed",
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
                    titleKey: "admin.deliverableQuantities.title",
                    href: "/admin/deliverable-quantities",
                    iconPath: mdiScale,
                  },
                ]
              : []),
          ],
        },
      ],
    },
    {
      titleKey: "admin.sidebar.content",
      items: [
        ...(canView("HERO_SECTIONS")
          ? [
              {
                titleKey: "admin.heroSection.title",
                href: "/admin/hero-section",
                iconPath: mdiImageMultiple, // image-multiple
              },
            ]
          : []),
      ],
    },
    {
      titleKey: "admin.sidebar.analytics",
      items: [
        ...(canViewAny(["ANALYTICS_REVENUE", "ANALYTICS"])
          ? [
              {
                titleKey: "admin.analytics.title",
                href: "/admin/analytics",
                iconPath: mdiChartBar, // chart-bar
              },
            ]
          : []),
        ...(canViewAny(["ANALYTICS_CATEGORY_INSIGHTS", "ANALYTICS"])
          ? [
              {
                titleKey: "admin.categoryInsights.title",
                href: "/admin/insights",
                iconPath: mdiChartPie, // chart-pie
              },
            ]
          : []),
        ...(reservationEntitled && canViewAny(["ANALYTICS_RESERVATION", "ANALYTICS"])
          ? [
              {
                titleKey: "admin.reservationAnalytics.title",
                href: "/admin/reservations/analytics",
                iconPath: mdiChartTimelineVariant, // chart-timeline-variant
              },
            ]
          : []),
      ],
    },
    {
      titleKey: "admin.sidebar.system",
      items: [
        ...(isSuperAdmin
          ? [
              {
                titleKey: "admin.organizations.title",
                href: "/admin/organizations",
                iconPath: mdiOfficeBuilding,
              },
            ]
          : []),

        ...((isSuperAdmin || isOrgAdmin)
          ? [
              {
                titleKey: "admin.settings.title",
                href: "/admin/settings",
                iconPath: mdiCog, // cog
              },
              {
                titleKey: "admin.auditLogs.title",
                href: "/admin/audit-logs",
                iconPath: mdiClipboardTextClockOutline,
              },
              ...(reservationEntitled
                ? [
                    {
                      titleKey: "admin.reservationSettings.title",
                      href: "/admin/reservations/settings",
                      iconPath: mdiCalendarEdit, // calendar-edit
                    },
                  ]
                : []),
            ]
          : []),
        ...(isSuperAdmin
          ? [
              {
                titleKey: "admin.pushNotifications.title",
                href: "/admin/push-notifications",
                iconPath: mdiBell, // bell
              },
            ]
          : []),
        ...(isSuperAdmin
          ? [
              {
                titleKey: "admin.termsAndPolicies.title",
                href: "/admin/terms-and-policies",
                iconPath: mdiFileDocumentOutline, // file-document-outline
              },
            ]
          : []),
      ],
    },
    ],
    [canAny, canView, canViewAny, isSuperAdmin, isOrgAdmin, userType]
  );

  const handleOpen = () => {
    setIsOpen(true);
    setIsOpening(true);
    onToggle?.(true);
    // Keep opening state for animation duration
    setTimeout(() => {
      setIsOpening(false);
    }, 400);
  };

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      onToggle?.(false);
    }, 400);
  }, [onToggle]);

  // Prevent horizontal scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflowX = "hidden";
    } else {
      document.body.style.overflowX = "unset";
    }

    return () => {
      document.body.style.overflowX = "unset";
    };
  }, [isOpen]);

  // Close drawer when route actually changes to the pending route
  useEffect(() => {
    if (pendingRoute && location.pathname === pendingRoute) {
      // Route has changed, close the drawer
      handleClose();
      setPendingRoute(null);
    }
  }, [location.pathname, pendingRoute, handleClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (isOpening) return;
    if (isClosing) return;

    const timeoutId = window.setTimeout(() => {
      const navEl = navRef.current;
      if (!navEl) return;

      const activeEl = navEl.querySelector(
        `button[data-href="${CSS.escape(location.pathname)}"]`
      ) as HTMLButtonElement | null;

      activeEl?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, isOpening, isClosing, location.pathname]);

  // Keep the active group expanded (do not force-close others).
  useEffect(() => {
    const activeGroupIds: string[] = [];
    for (const section of menuSections) {
      if (!section.groups) continue;
      for (const group of section.groups) {
        if (hasActiveRoute(group.items)) {
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
      return changed ? next : prev;
    });
  }, [location.pathname, menuSections, hasActiveRoute]);

  const toggleGroup = (groupId: string) => {
    const prevScrollTop = navRef.current?.scrollTop ?? 0;
    setExpandedGroups((prev) => {
      const nextExpanded = !prev[groupId];
      return {
        ...prev,
        [groupId]: nextExpanded,
      };
    });
    window.requestAnimationFrame(() => {
      if (navRef.current) navRef.current.scrollTop = prevScrollTop;
    });
  };

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(EXPANDED_GROUPS_STORAGE_KEY, JSON.stringify(expandedGroups));
    } catch {
      // ignore
    }
  }, [expandedGroups]);

  const SidebarContent = (): React.JSX.Element => (
    <div className="flex h-screen w-full flex-col bg-neutral-900 text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border flex-shrink-0">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 flex items-center justify-center">
          <Icon path={mdiCog} size={0.67} className="text-white" />
        </div>
        <span className="text-lg font-semibold text-white">
          {t("admin.panel")}
        </span>
      </div>

      {/* Navigation - Scrollable */}
      <nav ref={navRef} className="flex-1 p-4 space-y-6 overflow-y-auto">
        {menuSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="space-y-2">
            {section.titleKey && (
              <div className="px-3 py-1.5">
                <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  {t(section.titleKey)}
                </h3>
              </div>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = location.pathname === item.href;

                return (
                  <button
                    key={item.href}
                    data-href={item.href}
                    onClick={() => {
                      setPendingRoute(item.href);
                      navigate(item.href);
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors w-full text-left",
                      isActive
                        ? "bg-pink-500 text-white"
                        : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                    )}
                  >
                    <Icon path={item.iconPath} size={0.67} className="flex-shrink-0" />
                    <span className="whitespace-nowrap">
                      {item.titleKey ? t(item.titleKey) : item.title}
                    </span>
                  </button>
                );
              })}

              {section.groups?.map((group) => {
                const isExpanded = Boolean(expandedGroups[group.id]);
                const groupHasActiveRoute = hasActiveRoute(group.items);
                const contentId = `admin-sidebar-group-${group.id}`;

                if (group.items.length === 0) return null;

                return (
                  <div key={group.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={isExpanded}
                      aria-controls={contentId}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors w-full text-left",
                        groupHasActiveRoute
                          ? "bg-neutral-800 text-white"
                          : "text-neutral-200 hover:bg-neutral-800 hover:text-white"
                      )}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Icon path={group.iconPath} size={0.67} className="flex-shrink-0" />
                        <span className="truncate">{t(group.titleKey)}</span>
                      </span>
                      <Icon
                        path={mdiChevronDown}
                        size={0.67}
                        className={cn(
                          "flex-shrink-0 transition-transform",
                          isExpanded ? "rotate-180" : "rotate-0"
                        )}
                      />
                    </button>

                    <div
                      id={contentId}
                      className={cn(
                        "grid transition-[grid-template-rows,opacity] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[grid-template-rows,opacity]",
                        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      )}
                      aria-hidden={!isExpanded}
                    >
                      <div className="min-h-0 overflow-hidden pl-2 border-l border-neutral-800">
                        <div
                          className={cn(
                            "space-y-1 py-1 rounded-lg",
                            isExpanded ? "bg-neutral-800/40" : "bg-transparent"
                          )}
                        >
                          {group.items.map((item) => {
                            const isActive = location.pathname === item.href;
                            return (
                              <button
                                key={item.href}
                                data-href={item.href}
                                onClick={() => {
                                  setPendingRoute(item.href);
                                  navigate(item.href);
                                }}
                                className={cn(
                                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors w-full text-left",
                                  isActive
                                    ? "bg-pink-500 text-white"
                                    : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                                )}
                              >
                                <Icon path={item.iconPath} size={0.67} className="flex-shrink-0" />
                                <span className="whitespace-nowrap">
                                  {item.titleKey ? t(item.titleKey) : item.title}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border flex-shrink-0 space-y-3">
        {/* Admin User Info */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 flex items-center justify-center">
            <span className="text-xs font-bold text-white">
              {user?.firstName?.charAt(0) || "A"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.firstName && user?.lastName
                ? `${user.firstName} ${user.lastName}`
                : t("admin.adminUser")}
            </p>
            <p className="text-xs text-neutral-400 truncate">
              {user?.emailAddresses?.[0]?.emailAddress || "admin@example.com"}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Back to Site Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              try {
                sessionStorage.removeItem("bellami:customerScopeStep");
              } catch {}
              setPendingRoute("/scope");
              navigate("/scope");
            }}
            className="w-full justify-start text-neutral-300 hover:text-white hover:bg-neutral-800"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="mr-2" />
            {t("admin.backToSite")}
          </Button>

          {/* Logout Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              signOut();
              handleClose();
            }}
            className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/20"
          >
            <Icon path={mdiLogout} size={0.67} className="mr-2" />
            {t("common.logout")}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-muted text-foreground"
        onClick={() => {
          handleOpen();
        }}
      >
        <Icon path={mdiMenu} size={0.67} className="text-white/70" />
      </Button>

      {/* Custom Drawer */}
      {isOpen && (
        <>
          {/* Overlay */}
          <div
            className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-md cursor-pointer ${
              isClosing ? "opacity-0" : isOpening ? "opacity-0" : "opacity-100"
            }`}
            style={{
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100vw",
              height: "100vh",
              transition: "opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              animation: isOpening
                ? "fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards"
                : undefined,
            }}
            onClick={() => {
              handleClose();
            }}
          />

          {/* Drawer */}
          <div
            className={`fixed inset-y-0 z-[60] w-80 max-w-[85vw] bg-neutral-900 ${direction === 'rtl' ? 'border-l border-neutral-700' : 'border-r border-neutral-700'} shadow-2xl ${direction === 'rtl' ? 'right-0' : 'left-0'}`}
            style={{
              transform: isClosing
                ? direction === 'rtl' ? 'translateX(100%)' : 'translateX(-100%)'
                : isOpening
                ? direction === 'rtl' ? 'translateX(100%)' : 'translateX(-100%)'
                : 'translateX(0)',
              transition: isClosing || !isOpening
                ? 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                : undefined,
              animation: isOpening && !isClosing
                ? direction === 'rtl' ? 'slideInFromRight 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards' : 'slideInFromLeft 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                : undefined,
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <SidebarContent />

            {/* Close Button */}
            <Button
              variant="ghost"
              size="sm"
              className={`absolute ${direction === 'rtl' ? 'left-4' : 'right-4'} top-4 h-8 w-8 p-0 text-white hover:text-white/80 hover:bg-white/10 transition-opacity duration-200`}
              onClick={() => {
                handleClose();
              }}
            >
              <Icon path={mdiClose} size={0.67} />
            </Button>
          </div>
        </>
      )}

      {/* Animation styles */}
      <style>{`
        @keyframes slideInFromLeft {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
        
        @keyframes slideInFromRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
};

export default AdminSidebar;
