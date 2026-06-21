import React, { useEffect, useState, useRef } from "react";
import { Stack, useRouter, usePathname, useGlobalSearchParams, useLocalSearchParams } from "expo-router";
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useUser } from "@clerk/clerk-expo";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import NotificationBell from "@/components/admin/NotificationBell";
import { OrganizationSwitcher } from "@/components/admin/OrganizationSwitcher";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useScroll } from "@/src/contexts/ScrollContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

type MaterialCommunityIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
import { useFullView } from "@/src/contexts/FullViewContext";

const menuItems: { titleKey: string; href: string; icon: MaterialCommunityIconName }[] = [
  // Overview
  {
    titleKey: "admin.pageTitles.dashboard",
    href: "/(admin)",
    icon: "view-dashboard",
  },
  // Management
  {
    titleKey: "admin.pageTitles.userManagement",
    href: "/(admin)/users",
    icon: "account-group",
  },
  {
    titleKey: "admin.pageTitles.staffManagement",
    href: "/(admin)/staff-management",
    icon: "account-tie",
  },
  {
    titleKey: "admin.pageTitles.roleManagement",
    href: "/(admin)/role-management",
    icon: "shield-account",
  },
  {
    titleKey: "admin.pageTitles.myStaff",
    href: "/(admin)/my-staff",
    icon: "account-supervisor",
  },
  {
    titleKey: "admin.pageTitles.orderManagement",
    href: "/(admin)/orders",
    icon: "clipboard-list-outline",
  },
  {
    titleKey: "admin.pageTitles.menuManagement",
    href: "/(admin)/menu",
    icon: "food",
  },
  {
    titleKey: "admin.pageTitles.dealManagement",
    href: "/(admin)/deals",
    icon: "tag",
  },
  {
    titleKey: "admin.pageTitles.categoryManagement",
    href: "/(admin)/categories",
    icon: "shape",
  },
  {
    titleKey: "admin.pageTitles.addonManagement",
    href: "/(admin)/addons",
    icon: "plus-box-multiple",
  },
  {
    titleKey: "admin.pageTitles.declarationManagement",
    href: "/(admin)/declarations",
    icon: "tag-multiple",
  },
  {
    titleKey: "admin.optionalIngredientManagement.title",
    href: "/(admin)/optional-ingredients",
    icon: "food-variant",
  },
  {
    titleKey: "admin.pageTitles.reservation",
    href: "/(admin)/reservation-management",
    icon: "calendar-clock",
  },
  {
    titleKey: "admin.pageTitles.table",
    href: "/(admin)/table-management",
    icon: "table-furniture",
  },
  {
    titleKey: "admin.zoneManagement.title",
    href: "/(admin)/zone-management",
    icon: "map-marker-radius",
  },
  {
    titleKey: "admin.pageTitles.tableStatusGrid",
    href: "/(admin)/table-status-grid",
    icon: "grid",
  },
  {
    titleKey: "admin.pageTitles.branchManagement",
    href: "/(admin)/branch-management",
    icon: "store",
  },
  {
    titleKey: "admin.deliverableQuantities.title",
    href: "/(admin)/deliverable-quantities",
    icon: "scale",
  },
  // Content
  {
    titleKey: "admin.pageTitles.heroSection",
    href: "/(admin)/hero-section",
    icon: "image-multiple",
  },
  // Analytics
  {
    titleKey: "admin.pageTitles.revenueAnalytics",
    href: "/(admin)/analytics",
    icon: "chart-bar",
  },
  {
    titleKey: "admin.pageTitles.categoryInsights",
    href: "/(admin)/insights",
    icon: "chart-pie",
  },
  {
    titleKey: "admin.pageTitles.reservationAnalytics",
    href: "/(admin)/reservation-analytics",
    icon: "chart-timeline-variant",
  },
  // Business day reporting
  {
    titleKey: "admin.pageTitles.endOfDay",
    href: "/(admin)/business-day",
    icon: "calendar-check",
  },
  {
    titleKey: "admin.pageTitles.closedDays",
    href: "/(admin)/business-day/closed",
    icon: "calendar-multiple",
  },
  // System
  {
    titleKey: "admin.pageTitles.auditLogs",
    href: "/(admin)/audit-logs",
    icon: "clipboard-text-clock-outline",
  },
  {
    titleKey: "admin.pageTitles.organizations",
    href: "/(admin)/organizations",
    icon: "domain",
  },
  {
    titleKey: "admin.pageTitles.settings",
    href: "/(admin)/settings",
    icon: "cog",
  },
  {
    titleKey: "admin.pageTitles.pushNotifications",
    href: "/(admin)/push-notifications",
    icon: "bell",
  },
  {
    titleKey: "admin.pageTitles.termsAndPolicies",
    href: "/(admin)/terms-and-policies",
    icon: "file-document-outline",
  },
  {
    titleKey: "admin.pageTitles.reservationSettings",
    href: "/(admin)/reservation-settings",
    icon: "calendar-edit",
  },
];

function getCurrentTitle(pathname: string | null, t: (key: string) => string): string {
  if (!pathname) return t("admin.pageTitles.dashboard");
  
  // Normalize pathname - remove trailing slashes and query strings
  const normalizedPath = pathname.split("?")[0].replace(/\/$/, "");

  if (normalizedPath.includes("meal-branch-availability")) {
    return t("admin.menuManagement.branchAvailability");
  }
  
  // Try exact match first
  const exactMatch = menuItems.find((m) => normalizedPath === m.href);
  if (exactMatch?.titleKey) return t(exactMatch.titleKey);
  
  // Try prefix match
  const prefixMatch = menuItems.find((m) => {
    if (m.href === "/(admin)") {
      return normalizedPath === "/(admin)" || normalizedPath === "/(admin)";
    }
    return normalizedPath.startsWith(m.href + "/") || normalizedPath === m.href;
  });
  if (prefixMatch?.titleKey) return t(prefixMatch.titleKey);
  
  // Special case for table-management
  if (normalizedPath.includes("table-management")) {
    return t("admin.pageTitles.table");
  }
  // Special case for table-status-grid
  if (normalizedPath.includes("table-status-grid")) {
    return t("admin.pageTitles.tableStatusGrid");
  }
  
  // Special case for reservation-management
  if (normalizedPath.includes("reservation-management")) {
    return t("admin.pageTitles.reservation");
  }
  
  // Special case for categories - show just "Category"
  if (normalizedPath.includes("categories") && !normalizedPath.includes("category-ordering") && !normalizedPath.includes("category-meal-ordering")) {
    return "Category";
  }
  
  // Special case for addons - show just "Addon"
  if (normalizedPath.includes("addons") && !normalizedPath.includes("addon-form")) {
    return "Addon";
  }
  
  // Special case for declarations - show just "Declaration"
  if (normalizedPath.includes("declarations") && !normalizedPath.includes("declaration-form")) {
    return "Declaration";
  }
  
  // Special case for branch-management - show just "Branch"
  if (normalizedPath.includes("branch-management") && !normalizedPath.includes("branch-form") && !normalizedPath.includes("branch-reservation-settings")) {
    return "Branch";
  }
  
  // Special case for zone-management - show just "Zone"
  if (normalizedPath.includes("zone-management")) {
    return "Zone";
  }
  
  // Special case for category-ordering
  if (normalizedPath.includes("category-ordering")) {
    return t("admin.pageTitles.orderingAndDisplayPriority");
  }
  
  // Special case for featured-meals-ordering
  if (normalizedPath.includes("featured-meals-ordering")) {
    return t("admin.pageTitles.featuredMealsOrdering");
  }
  
  // Special case for category-meal-ordering
  if (normalizedPath.includes("category-meal-ordering")) {
    return t("admin.pageTitles.categoryMealOrdering");
  }

  // Special case for deal-category-ordering
  if (normalizedPath.includes("deal-category-ordering")) {
    return t("admin.pageTitles.dealCategoryOrdering");
  }

  // Special case for category-deal-ordering
  if (normalizedPath.includes("category-deal-ordering")) {
    return t("admin.pageTitles.categoryDealOrdering");
  }
  
  // Special case for settings
  if (normalizedPath.includes("/settings")) {
    return t("admin.pageTitles.settings");
  }
  
  // Special case for deals
  if (normalizedPath.includes("/deals")) {
    return t("admin.pageTitles.dealManagement");
  }
  
  // Fallback: derive title from pathname segment after /(admin)
  const parts = normalizedPath.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "(admin)");
  const seg = parts[idx >= 0 ? idx + 1 : parts.length - 1] || "";
  if (!seg) return t("admin.pageTitles.dashboard");
  
  // Map common segments to translation keys
  const segmentMap: Record<string, string> = {
    "settings": "admin.pageTitles.settings",
    "users": "admin.pageTitles.userManagement",
    "staff-management": "admin.pageTitles.staffManagement",
    "staff-user": "admin.pageTitles.staffManagement",
    "role-management": "admin.pageTitles.roleManagement",
    "my-staff": "admin.pageTitles.myStaff",
    "orders": "admin.pageTitles.orderManagement",
    "menu": "admin.pageTitles.menuManagement",
    "deals": "admin.pageTitles.dealManagement",
    "categories": "admin.pageTitles.categoryManagement",
    "addons": "admin.pageTitles.addonManagement",
    "analytics": "admin.pageTitles.revenueAnalytics",
    "reservation-analytics": "admin.pageTitles.reservationAnalytics",
    "insights": "admin.pageTitles.categoryInsights",
    "hero-section": "admin.pageTitles.heroSection",
    "organizations": "admin.pageTitles.organizations",
    "audit-logs": "admin.pageTitles.auditLogs",
    "declarations": "admin.pageTitles.declarationManagement",
    "push-notifications": "admin.pageTitles.pushNotifications",
    "reservation-settings": "admin.pageTitles.reservationSettings",
    "terms-and-policies": "admin.pageTitles.termsAndPolicies",
    "business-day": "admin.pageTitles.endOfDay",
  };
  
  if (segmentMap[seg]) {
    return t(segmentMap[seg]);
  }
  
  const pretty = seg
    .replace(/-/g, " ")
    .replace(/\.[^/.]+$/, "")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  return pretty || t("admin.pageTitles.dashboard");
}

function getRequiredPermission(normalizedPath: string):
  | { resource: (typeof RESOURCES)[keyof typeof RESOURCES]; action: (typeof ACTIONS)[keyof typeof ACTIONS] }
  | null {
  if (!normalizedPath || normalizedPath === "/") return { resource: RESOURCES.DASHBOARD, action: ACTIONS.VIEW };

  // Super admin-only pages are handled separately
  if (normalizedPath.startsWith("/users")) return null;
  if (normalizedPath.startsWith("/staff-management")) return null;
  if (normalizedPath.startsWith("/staff-user")) return null;
  if (normalizedPath.startsWith("/role-management")) return null;

  if (normalizedPath.startsWith("/my-staff")) return null;

  if (normalizedPath.startsWith("/orders")) return { resource: RESOURCES.ORDERS, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/menu")) return { resource: RESOURCES.MENU, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/deals")) return { resource: RESOURCES.DEALS, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/deal-category-ordering")) return { resource: RESOURCES.CATEGORIES, action: ACTIONS.ORDERING };
  if (normalizedPath.startsWith("/category-deal-ordering")) return { resource: RESOURCES.DEALS, action: ACTIONS.REORDER_CATEGORY };
  if (normalizedPath.startsWith("/categories")) return { resource: RESOURCES.CATEGORIES, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/addons")) return { resource: RESOURCES.ADDONS, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/declarations")) return { resource: RESOURCES.DECLARATIONS, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/optional-ingredients")) return { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/reservation-management")) return { resource: RESOURCES.RESERVATIONS, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/table-management")) return { resource: RESOURCES.TABLES, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/zone-management")) return { resource: RESOURCES.ZONES, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/table-status-grid")) return { resource: RESOURCES.TABLE_STATUS_GRID, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/branch-management")) return { resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/deliverable-quantities")) return { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/hero-section")) return { resource: RESOURCES.HERO_SECTIONS, action: ACTIONS.VIEW };

  if (normalizedPath.startsWith("/analytics")) return { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/insights")) return { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW };
  if (normalizedPath.startsWith("/reservation-analytics")) return { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW };

  // System pages - currently super admin-only in sidebar
  if (normalizedPath.startsWith("/settings")) return null;
  if (normalizedPath.startsWith("/push-notifications")) return null;
  if (normalizedPath.startsWith("/terms-and-policies")) return null;
  if (normalizedPath.startsWith("/reservation-settings")) return null;

  return null;
}

export default function AdminLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ title?: string; categoryId?: string | string[]; categoryName?: string | string[] }>();
  const localParams = useLocalSearchParams<{ categoryId?: string | string[]; categoryName?: string | string[] }>();
  const { t } = useTranslation();
  const { userType, isLoading } = useAuthRole();
  const { can, canAny, rbacUser, isLoading: permissionsLoading } = usePermissions();
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { isScrollingDown, isAtTop } = useScroll();
  const { isFullView } = useFullView();
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const headerContentHeight = 56;
  const statusBarHeight = insets.top;
  
  // Hide header for pages that have their own headers
  // Also hide for menu page when viewing a category (will be handled by AnimatedHeader in menu.tsx)
  // Also hide when in full view mode
  const isMenuPage = pathname === "/(admin)/menu" || pathname?.startsWith("/(admin)/menu");
  const shouldShowHeader =
    !isFullView &&
    !pathname?.includes("/order-details") &&
    !pathname?.includes("/bill-preview") &&
    !pathname?.includes("/business-day/closed/") &&
    !pathname?.includes("/category-form") &&
    !pathname?.includes("/category-ordering") &&
    !pathname?.includes("/featured-meals-ordering") &&
    !pathname?.includes("/category-meal-ordering") &&
    !pathname?.includes("/deal-category-ordering") &&
    !pathname?.includes("/category-deal-ordering") &&
    !pathname?.includes("/meal-form") &&
    !pathname?.includes("/deal-form") &&
    !pathname?.includes("/addon-form") &&
    !pathname?.includes("/optional-ingredient-form") &&
    !pathname?.includes("/declaration-form") &&
    !pathname?.includes("/policy-form") &&
    !pathname?.includes("/reservation-details") &&
    !pathname?.includes("/table-form") &&
    !pathname?.includes("/branch-reservation-settings") &&
    !pathname?.includes("/branch-form") &&
    !pathname?.includes("/meal-branch-availability") &&
    !isMenuPage;

  const getParamString = (value: unknown): string => {
    if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
    return typeof value === "string" ? value : "";
  };

  const isStaffUserRoute = !!pathname && pathname.includes("/staff-user/");
  const categoryIdParam = getParamString((localParams as any)?.categoryId) || getParamString((params as any)?.categoryId);
  const categoryNameParam = getParamString((localParams as any)?.categoryName) || getParamString((params as any)?.categoryName);
  const isDealsCategoryRoute =
    (pathname === "/(admin)/deals" || pathname?.startsWith("/(admin)/deals")) &&
    (categoryIdParam.trim().length > 0 || categoryNameParam.trim().length > 0);

  const dealsCategoryTitleRaw = categoryNameParam.trim();
  const dealsCategoryTitle = dealsCategoryTitleRaw.length > 0 ? decodeURIComponent(dealsCategoryTitleRaw) : t("admin.pageTitles.dealManagement");

  const headerTitle = isStaffUserRoute
    ? typeof params.title === "string" && params.title.trim()
      ? params.title
      : t("admin.staffManagement.manageDialogTitle", { defaultValue: "Manage Staff" })
    : isDealsCategoryRoute
    ? dealsCategoryTitle
    : getCurrentTitle(pathname, t);

  const normalizedPathForHeader = (pathname || "")
    .split("?")[0]
    .replace(/^\/\([^/]+\)/, "")
    .replace(/\/+$/, "");

  const isDashboardRoute = normalizedPathForHeader === "";
  const isOrdersRoute = normalizedPathForHeader === "/orders";
  const isReservationManagementRoute =
    normalizedPathForHeader === "/reservation-management";
  const isMenuRoute = normalizedPathForHeader === "/menu";
  const isDealsRoute = normalizedPathForHeader === "/deals";
  const isCategoriesRoute = normalizedPathForHeader === "/categories";
  const isAddonsRoute = normalizedPathForHeader === "/addons";
  const isOptionalIngredientsRoute =
    normalizedPathForHeader === "/optional-ingredients";
  const isDeclarationsRoute = normalizedPathForHeader === "/declarations";
  const isTableManagementRoute = normalizedPathForHeader === "/table-management";
  const isZoneManagementRoute = normalizedPathForHeader === "/zone-management";
  const isTableStatusGridRoute = normalizedPathForHeader === "/table-status-grid";
  const isUsersRoute = normalizedPathForHeader === "/users";
  const isStaffManagementRoute = normalizedPathForHeader === "/staff-management";
  const isRoleManagementRoute = normalizedPathForHeader === "/role-management";
  const isBranchManagementRoute = normalizedPathForHeader === "/branch-management";
  const isDeliverableQuantitiesRoute = normalizedPathForHeader === "/deliverable-quantities";
  const isEndOfDayRoute = normalizedPathForHeader === "/business-day";
  const isClosedDaysRoute = normalizedPathForHeader === "/business-day/closed";
  const isRevenueAnalyticsRoute = normalizedPathForHeader === "/analytics";
  const isCategoryInsightsRoute = normalizedPathForHeader === "/insights";
  const isReservationAnalyticsRoute = normalizedPathForHeader === "/reservation-analytics";
  const isHeroSectionRoute = normalizedPathForHeader === "/hero-section";
  const isOrganizationsRoute = normalizedPathForHeader === "/organizations";
  const isSettingsRoute = normalizedPathForHeader === "/settings";
  const isAuditLogsRoute = normalizedPathForHeader === "/audit-logs";
  const isReservationSettingsRoute = normalizedPathForHeader === "/reservation-settings";
  const isPushNotificationsRoute = normalizedPathForHeader === "/push-notifications";
  const isTermsAndPoliciesRoute = normalizedPathForHeader === "/terms-and-policies";
  const shouldShowOrgSwitcherInTitle =
    userType === "SUPER_ADMIN" &&
    (isDashboardRoute ||
      isOrdersRoute ||
      isReservationManagementRoute ||
      isMenuRoute ||
      isDealsRoute ||
      isCategoriesRoute ||
      isAddonsRoute ||
      isOptionalIngredientsRoute ||
      isDeclarationsRoute ||
      isTableManagementRoute ||
      isZoneManagementRoute ||
      isTableStatusGridRoute ||
      isUsersRoute ||
      isStaffManagementRoute ||
      isRoleManagementRoute ||
      isBranchManagementRoute ||
      isDeliverableQuantitiesRoute ||
      isEndOfDayRoute ||
      isClosedDaysRoute ||
      isRevenueAnalyticsRoute ||
      isCategoryInsightsRoute ||
      isReservationAnalyticsRoute ||
      isHeroSectionRoute ||
      isOrganizationsRoute ||
      isSettingsRoute ||
      isAuditLogsRoute ||
      isReservationSettingsRoute ||
      isPushNotificationsRoute ||
      isTermsAndPoliciesRoute);

  const canViewNotifications =
    !permissionsLoading &&
    can(RESOURCES.NOTIFICATIONS, ACTIONS.VIEW);

  useEffect(() => {
    if (isLoading || permissionsLoading) return;
    const orgRole = (rbacUser as any)?.orgRole as string | null | undefined;
    const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
    const rbacUserType = (rbacUser as any)?.userType as string | null | undefined;

    // Prefer RBAC user type (from /api/permissions/me) over AuthContext userType
    // because AuthContext is derived from /api/user/profile and can be null/stale.
    const effectiveUserType = rbacUserType || userType;

    // Allow org admins into admin panel even if their userType is USER.
    // Block only when we definitively know the user is not entitled.
    const allowed = Boolean(isOrgAdmin || (effectiveUserType && effectiveUserType !== "USER"));
    if (!allowed) {
      console.warn("[AdminLayout] redirecting out of admin", {
        authUserType: userType,
        rbacUserType,
        orgRole,
        isOrgAdmin,
        pathname,
      });
      router.replace("/(tabs)");
    }
  }, [userType, isLoading, permissionsLoading, router, rbacUser]);

  useEffect(() => {
    if (isLoading || permissionsLoading) return;
    if (!pathname) return;

    // Normalize pathname: remove the /(admin) group prefix and ignore query
    const normalizedPath = pathname.split("?")[0].replace(/^\/\([^/]+\)/, "");

    const reservationEntitled =
      userType === "SUPER_ADMIN"
        ? true
        : (rbacUser as any)?.organizationEntitlements?.reservationsAllowed !== false;

    const isReservationEntitledRoute =
      normalizedPath.startsWith("/reservation-management") ||
      normalizedPath.startsWith("/reservation-analytics") ||
      normalizedPath.startsWith("/reservation-settings") ||
      normalizedPath.startsWith("/table-management") ||
      normalizedPath.startsWith("/zone-management") ||
      normalizedPath.startsWith("/table-status-grid") ||
      normalizedPath.startsWith("/branch-reservation-settings");

    if (!reservationEntitled && isReservationEntitledRoute) {
      console.warn("[AdminLayout] redirecting to /(admin) (reservation entitlement)", {
        normalizedPath,
        authUserType: userType,
        rbacUserType: (rbacUser as any)?.userType,
        orgRole: (rbacUser as any)?.orgRole,
        reservationEntitled,
      });
      router.replace("/(admin)");
      return;
    }

    // Super admin-only routes (match web sidebar behavior)
    const isSuperAdminOnlyRoute =
      normalizedPath.startsWith("/users") ||
      normalizedPath.startsWith("/push-notifications") ||
      normalizedPath.startsWith("/terms-and-policies");

    if (isSuperAdminOnlyRoute && userType !== "SUPER_ADMIN") {
      console.warn("[AdminLayout] redirecting to /(admin) (super admin only route)", {
        normalizedPath,
        authUserType: userType,
        rbacUserType: (rbacUser as any)?.userType,
        orgRole: (rbacUser as any)?.orgRole,
      });
      router.replace("/(admin)");
      return;
    }

    const isSettingsRouteGuard = normalizedPath.startsWith("/settings");
    if (isSettingsRouteGuard) {
      const role = (rbacUser as any)?.orgRole as string | null | undefined;
      const allowed = userType === "SUPER_ADMIN" || role === "ORG_OWNER" || role === "ORG_ADMIN";
      if (!allowed) {
        console.warn("[AdminLayout] redirecting to /(admin) (settings route guard)", {
          normalizedPath,
          authUserType: userType,
          rbacUserType: (rbacUser as any)?.userType,
          orgRole: role,
        });
        router.replace("/(admin)");
        return;
      }
    }

    const isReservationSettingsRouteGuard = normalizedPath.startsWith("/reservation-settings");
    if (isReservationSettingsRouteGuard) {
      const role = (rbacUser as any)?.orgRole as string | null | undefined;
      const allowed = userType === "SUPER_ADMIN" || role === "ORG_OWNER" || role === "ORG_ADMIN";
      if (!allowed) {
        console.warn("[AdminLayout] redirecting to /(admin) (reservation settings route guard)", {
          normalizedPath,
          authUserType: userType,
          rbacUserType: (rbacUser as any)?.userType,
          orgRole: role,
        });
        router.replace("/(admin)");
        return;
      }
    }

    const isStaffManagementRouteGuard =
      normalizedPath.startsWith("/staff-management") ||
      normalizedPath.startsWith("/staff-user");

    if (isStaffManagementRouteGuard) {
      const role = (rbacUser as any)?.orgRole as string | null | undefined;
      const allowed =
        userType === "SUPER_ADMIN" || role === "ORG_OWNER" || role === "ORG_ADMIN";
      if (!allowed) {
        console.warn("[AdminLayout] redirecting to /(admin) (staff management route guard)", {
          normalizedPath,
          authUserType: userType,
          rbacUserType: (rbacUser as any)?.userType,
          orgRole: role,
        });
        router.replace("/(admin)");
        return;
      }
    }

    const isRoleManagementRouteGuard = normalizedPath.startsWith("/role-management");
    if (isRoleManagementRouteGuard) {
      const role = (rbacUser as any)?.orgRole as string | null | undefined;
      const allowed = userType === "SUPER_ADMIN" || role === "ORG_OWNER";
      if (!allowed) {
        console.warn("[AdminLayout] redirecting to /(admin) (role management route guard)", {
          normalizedPath,
          authUserType: userType,
          rbacUserType: (rbacUser as any)?.userType,
          orgRole: role,
        });
        router.replace("/(admin)");
      }
      return;
    }

    const isAuditLogsRouteGuard = normalizedPath.startsWith("/audit-logs");
    if (isAuditLogsRouteGuard) {
      const role = (rbacUser as any)?.orgRole as string | null | undefined;
      const allowed =
        userType === "SUPER_ADMIN" || role === "ORG_OWNER" || role === "ORG_ADMIN";
      if (!allowed) {
        console.warn("[AdminLayout] redirecting to /(admin) (audit logs route guard)", {
          normalizedPath,
          authUserType: userType,
          rbacUserType: (rbacUser as any)?.userType,
          orgRole: role,
        });
        router.replace("/(admin)");
      }
      return;
    }

    // Branch admin-only route
    if (normalizedPath.startsWith("/my-staff") && userType !== "BRANCH_ADMIN") {
      console.warn("[AdminLayout] redirecting to /(admin) (my-staff branch admin only)", {
        normalizedPath,
        authUserType: userType,
        rbacUserType: (rbacUser as any)?.userType,
        orgRole: (rbacUser as any)?.orgRole,
      });
      router.replace("/(admin)");
      return;
    }

    // RBAC-based check for all other routes
    const required = getRequiredPermission(normalizedPath);
    if (!required) return;

    // Deliverable Quantities: allow VIEW or MANAGE (manage-only roles shouldn't be blocked)
    if (normalizedPath.startsWith("/deliverable-quantities")) {
      const allowed = canAny([
        { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.VIEW },
        { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.MANAGE },
      ]);
      if (!allowed) {
        router.replace("/(admin)");
      }
      return;
    }

    // Analytics pages: allow base ANALYTICS view OR the corresponding sub-permission
    if (normalizedPath.startsWith("/analytics")) {
      const allowed = canAny([
        { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
        { resource: RESOURCES.ANALYTICS_REVENUE, action: ACTIONS.VIEW },
      ]);
      if (!allowed) router.replace("/(admin)");
      return;
    }

    if (normalizedPath.startsWith("/insights")) {
      const allowed = canAny([
        { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
        { resource: RESOURCES.ANALYTICS_CATEGORY_INSIGHTS, action: ACTIONS.VIEW },
      ]);
      if (!allowed) router.replace("/(admin)");
      return;
    }

    if (normalizedPath.startsWith("/reservation-analytics")) {
      const allowed = canAny([
        { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
        { resource: RESOURCES.ANALYTICS_RESERVATION, action: ACTIONS.VIEW },
      ]);
      if (!allowed) router.replace("/(admin)");
      return;
    }

    if (!can(required.resource, required.action)) {
      console.warn("[AdminLayout] redirecting to /(admin) (RBAC permission denied)", {
        normalizedPath,
        required,
        authUserType: userType,
        rbacUserType: (rbacUser as any)?.userType,
        orgRole: (rbacUser as any)?.orgRole,
      });
      router.replace("/(admin)");
    }
  }, [pathname, userType, isLoading, permissionsLoading, can, canAny, router]);

  useEffect(() => {
    const shouldShow = isAtTop || !isScrollingDown;

    Animated.timing(headerTranslateY, {
      toValue: shouldShow ? 0 : -(headerContentHeight + 10),
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isScrollingDown, isAtTop, headerTranslateY, headerContentHeight]);

  return (
    <>
      {/* Status Bar */}
      <StatusBar barStyle="light-content" />
      {/* Status Bar Background - Stable */}
      {statusBarHeight > 0 && shouldShowHeader && (
        <View
          style={[styles.statusBarBackground, { height: statusBarHeight }]}
        />
      )}
      {/* Header - Animated */}
      {shouldShowHeader && (
        <Animated.View
          style={[
            styles.headerContainer,
            {
              top: statusBarHeight,
              transform: [{ translateY: headerTranslateY }],
            },
          ]}
        >
          <View style={[styles.header, (isStaffUserRoute || isDealsCategoryRoute) && styles.headerMinimal]}>
            {isStaffUserRoute || isDealsCategoryRoute ? (
              <View style={styles.headerMinimalContent}>
                <TouchableOpacity
                  onPress={() => (router.canGoBack() ? router.back() : router.replace("/(admin)"))}
                  style={styles.menuButton}
                >
                  <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{headerTitle}</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => setSidebarOpen(true)}
                  style={styles.menuButton}
                >
                  <MaterialCommunityIcons name="menu" size={20} color="#fff" />
                </TouchableOpacity>

                {shouldShowOrgSwitcherInTitle ? (
                  <OrganizationSwitcher variant="title" />
                ) : (
                  <Text style={styles.headerTitle}>{headerTitle}</Text>
                )}

                <View style={styles.headerRight}>
                  {userType === "SUPER_ADMIN" &&
                    !isDashboardRoute &&
                    !isOrdersRoute &&
                    !isReservationManagementRoute &&
                    !isMenuRoute &&
                    !isDealsRoute &&
                    !isCategoriesRoute &&
                    !isAddonsRoute &&
                    !isOptionalIngredientsRoute &&
                    !isDeclarationsRoute &&
                    !isTableManagementRoute &&
                    !isZoneManagementRoute &&
                    !isTableStatusGridRoute &&
                    !isUsersRoute &&
                    !isStaffManagementRoute &&
                    !isRoleManagementRoute &&
                    !isBranchManagementRoute &&
                    !isDeliverableQuantitiesRoute &&
                    !isEndOfDayRoute &&
                    !isClosedDaysRoute &&
                    !isRevenueAnalyticsRoute &&
                    !isCategoryInsightsRoute &&
                    !isReservationAnalyticsRoute &&
                    !isHeroSectionRoute &&
                    !isOrganizationsRoute &&
                    !isSettingsRoute &&
                    !isAuditLogsRoute &&
                    !isReservationSettingsRoute &&
                    !isPushNotificationsRoute &&
                    !isTermsAndPoliciesRoute && (
                    <OrganizationSwitcher variant="compact" />
                  )}
                  <LanguageSwitcher />
                  {canViewNotifications && <NotificationBell />}

                  {user?.imageUrl ? (
                    <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>
                        {user?.firstName?.charAt(0) ||
                          user?.emailAddresses?.[0]?.emailAddress
                            ?.charAt(0)
                            .toUpperCase() ||
                          "A"}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        </Animated.View>
      )}

      {/* Sidebar */}
      <AdminSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Stack Navigation */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: "#0a0a0a", // Dark background
          },
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  statusBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0a0a0a",
    zIndex: 1001,
    elevation: 1001, // For Android
  },
  headerContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000, // For Android
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingVertical: 8,
    backgroundColor: "#0a0a0a",
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    minHeight: 56,
  },
  headerMinimal: {
    justifyContent: "flex-start",
  },
  headerMinimalContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ec4899",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
});

// Export helper function to get admin header height
export function getAdminHeaderHeight(): number {
  return 56;
}

