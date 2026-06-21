import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Animated,
  Easing,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useClerk, useUser } from "@clerk/clerk-expo";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

type MaterialCommunityIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  title: string;
  href: string;
  icon: MaterialCommunityIconName;
}
interface MenuSection {
  titleKey: string;
  items: MenuItem[];
  groups?: Array<{
    id: string;
    title: string;
    icon: MaterialCommunityIconName;
    items: MenuItem[];
  }>;
}

export function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const { t } = useTranslation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { userType } = useAuthRole();
  const { can, canAny, rbacUser, isLoading: permissionsLoading } = usePermissions();
  const { clearSelectedOrganizationId } = useOrganization();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top;

  const viewerOrgRole = (rbacUser as any)?.orgRole as string | null | undefined;

  const reservationEntitled =
    userType === "SUPER_ADMIN" ? true : (rbacUser as any)?.organizationEntitlements?.reservationsAllowed !== false;
  const canViewStaffManagement =
    userType === "SUPER_ADMIN" ||
    viewerOrgRole === "ORG_OWNER" ||
    viewerOrgRole === "ORG_ADMIN";

  const canViewAuditLogs =
    userType === "SUPER_ADMIN" ||
    viewerOrgRole === "ORG_OWNER" ||
    viewerOrgRole === "ORG_ADMIN";

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const normalizedPath = useMemo(() => {
    return pathname ? pathname.replace(/^\/\([^/]+\)/, "").replace(/\/+$/, "") : "";
  }, [pathname]);

  const isActivePath = (itemHref: string) => {
    const itemPath = itemHref.replace(/^\/\([^/]+\)/, "").replace(/\/+$/, "");
    const isDashboard = itemPath === "" || itemPath === "/";
    if (isDashboard) return normalizedPath === "" || normalizedPath === "/";

    return normalizedPath === itemPath || normalizedPath.startsWith(itemPath + "/");
  };

  const hasActiveRoute = (items: MenuItem[]) => items.some((i) => isActivePath(i.href));

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const canView = (resource: keyof typeof RESOURCES) => {
    if (permissionsLoading) return false;
    return can(RESOURCES[resource], ACTIONS.VIEW);
  };

  const menuSections: MenuSection[] = [
    {
      titleKey: "admin.sidebar.overview",
      items: [
        ...(canView("DASHBOARD")
          ? [
              {
                title: t("admin.dashboard.title"),
                href: "/(admin)",
                icon: "view-dashboard" as MaterialCommunityIconName,
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
          title: t("admin.sidebar.groups.orders", { defaultValue: "Orders" }),
          icon: "clipboard-list-outline" as MaterialCommunityIconName,
          items: [
            ...(canView("ORDERS")
              ? [
                  {
                    title: t("admin.orderManagement.title"),
                    href: "/(admin)/orders",
                    icon: "clipboard-list-outline" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(reservationEntitled && canView("RESERVATIONS")
              ? [
                  {
                    title: t("admin.reservationManagement.title"),
                    href: "/(admin)/reservation-management",
                    icon: "calendar-clock" as MaterialCommunityIconName,
                  },
                ]
              : []),
          ],
        },
        {
          id: "menu",
          title: t("admin.sidebar.groups.menu", { defaultValue: "Menu" }),
          icon: "food" as MaterialCommunityIconName,
          items: [
            ...(canView("MENU")
              ? [
                  {
                    title: t("admin.menuManagement.title"),
                    href: "/(admin)/menu",
                    icon: "food" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(canView("MENU")
              ? [
                  {
                    title: t("admin.dealManagement.title"),
                    href: "/(admin)/deals",
                    icon: "tag" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(canView("CATEGORIES")
              ? [
                  {
                    title: t("admin.categoryManagement.title"),
                    href: "/(admin)/categories",
                    icon: "shape" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(canView("ADDONS")
              ? [
                  {
                    title: t("admin.addonManagement.title"),
                    href: "/(admin)/addons",
                    icon: "plus-box-multiple" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(canView("MEALS")
              ? [
                  {
                    title: t("admin.optionalIngredientManagement.title"),
                    href: "/(admin)/optional-ingredients",
                    icon: "food-variant" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(canView("DECLARATIONS")
              ? [
                  {
                    title: t("admin.declarationManagement.title"),
                    href: "/(admin)/declarations",
                    icon: "tag-multiple" as MaterialCommunityIconName,
                  },
                ]
              : []),
          ],
        },
        ...(reservationEntitled
          ? [
              {
                id: "tables",
                title: t("admin.sidebar.groups.tables", { defaultValue: "Tables" }),
                icon: "table-furniture" as MaterialCommunityIconName,
                items: [
                  ...(canView("TABLES")
                    ? [
                        {
                          title: t("admin.tableManagement.title"),
                          href: "/(admin)/table-management",
                          icon: "table-furniture" as MaterialCommunityIconName,
                        },
                      ]
                    : []),
                  ...(canView("ZONES")
                    ? [
                        {
                          title: t("admin.zoneManagement.title"),
                          href: "/(admin)/zone-management",
                          icon: "map-marker-radius" as MaterialCommunityIconName,
                        },
                      ]
                    : []),
                  ...(canView("TABLE_STATUS_GRID")
                    ? [
                        {
                          title: t("admin.pageTitles.tableStatusGrid"),
                          href: "/(admin)/table-status-grid",
                          icon: "grid" as MaterialCommunityIconName,
                        },
                      ]
                    : []),
                ],
              },
            ]
          : []),
        {
          id: "people",
          title: t("admin.sidebar.groups.people", { defaultValue: "People" }),
          icon: "account-group" as MaterialCommunityIconName,
          items: [
            ...(userType === "BRANCH_ADMIN"
              ? [
                  {
                    title: t("admin.myStaff.title"),
                    href: "/(admin)/my-staff",
                    icon: "account-supervisor" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(userType === "SUPER_ADMIN"
              ? [
                  {
                    title: t("admin.userManagement.title"),
                    href: "/(admin)/users",
                    icon: "account-group" as MaterialCommunityIconName,
                  },
                  {
                    title: t("admin.staffManagement.title"),
                    href: "/(admin)/staff-management",
                    icon: "account-tie" as MaterialCommunityIconName,
                  },
                  {
                    title: t("admin.roleManagement.title"),
                    href: "/(admin)/role-management",
                    icon: "shield-account" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(canViewStaffManagement && userType !== "SUPER_ADMIN"
              ? [
                  {
                    title: t("admin.staffManagement.title"),
                    href: "/(admin)/staff-management",
                    icon: "account-tie" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(viewerOrgRole === "ORG_OWNER"
              ? [
                  {
                    title: t("admin.roleManagement.title"),
                    href: "/(admin)/role-management",
                    icon: "shield-account" as MaterialCommunityIconName,
                  },
                ]
              : []),
          ],
        },
        {
          id: "branches",
          title: t("admin.sidebar.groups.branches", { defaultValue: "Branches" }),
          icon: "store" as MaterialCommunityIconName,
          items: [
            ...(canView("BRANCHES")
              ? [
                  {
                    title: t("admin.pageTitles.branchManagement"),
                    href: "/(admin)/branch-management",
                    icon: "store" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(canAny([
              { resource: RESOURCES.END_OF_DAY, action: ACTIONS.VIEW },
              { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
            ])
              ? [
                  {
                    title: t("admin.businessDay.title"),
                    href: "/(admin)/business-day",
                    icon: "calendar-check" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(canAny([
              { resource: RESOURCES.CLOSED_DAYS, action: ACTIONS.VIEW },
              { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
            ])
              ? [
                  {
                    title: t("admin.businessDayClosedDays.title"),
                    href: "/(admin)/business-day/closed",
                    icon: "calendar-multiple" as MaterialCommunityIconName,
                  },
                ]
              : []),
            ...(canAny([
              { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.VIEW },
              { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.MANAGE },
            ])
              ? [
                  {
                    title: t("admin.deliverableQuantities.title"),
                    href: "/(admin)/deliverable-quantities",
                    icon: "scale" as MaterialCommunityIconName,
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
                title: t("admin.heroSection.title"),
                href: "/(admin)/hero-section",
                icon: "image-multiple" as MaterialCommunityIconName,
              },
            ]
          : []),
      ],
    },
    {
      titleKey: "admin.sidebar.analytics",
      items: [
        ...(canView("ANALYTICS") || canView("ANALYTICS_REVENUE")
          ? [
              {
                title: t("admin.analytics.title"),
                href: "/(admin)/analytics",
                icon: "chart-bar" as MaterialCommunityIconName,
              },
            ]
          : []),
        ...(canView("ANALYTICS") || canView("ANALYTICS_CATEGORY_INSIGHTS")
          ? [
              {
                title: t("admin.categoryInsights.title"),
                href: "/(admin)/insights",
                icon: "chart-pie" as MaterialCommunityIconName,
              },
            ]
          : []),
        ...(reservationEntitled && (canView("ANALYTICS") || canView("ANALYTICS_RESERVATION"))
          ? [
              {
                title: t("admin.reservationAnalytics.title"),
                href: "/(admin)/reservation-analytics",
                icon: "chart-timeline-variant" as MaterialCommunityIconName,
              },
            ]
          : []),
      ],
    },
    {
      titleKey: "admin.sidebar.system",
      items: [
        ...(canViewAuditLogs
          ? [
              {
                title: t("admin.auditLogs.title"),
                href: "/(admin)/audit-logs",
                icon: "clipboard-text-clock-outline" as MaterialCommunityIconName,
              },
            ]
          : []),
        ...(userType === "SUPER_ADMIN"
          ? [
              {
                title: t("admin.organizations.title"),
                href: "/(admin)/organizations",
                icon: "domain" as MaterialCommunityIconName,
              },
              {
                title: t("admin.settings.title"),
                href: "/(admin)/settings",
                icon: "cog" as MaterialCommunityIconName,
              },
              ...(reservationEntitled
                ? [
                    {
                      title: t("admin.reservationSettings.title"),
                      href: "/(admin)/reservation-settings",
                      icon: "calendar-edit" as MaterialCommunityIconName,
                    },
                  ]
                : []),
              {
                title: t("admin.pushNotifications.title"),
                href: "/(admin)/push-notifications",
                icon: "bell" as MaterialCommunityIconName,
              },
              {
                title: t("admin.termsAndPolicies.title"),
                href: "/(admin)/terms-and-policies",
                icon: "file-document-outline" as MaterialCommunityIconName,
              },
            ]
          : viewerOrgRole === "ORG_OWNER" || viewerOrgRole === "ORG_ADMIN"
          ? [
              {
                title: t("admin.settings.title"),
                href: "/(admin)/settings",
                icon: "cog" as MaterialCommunityIconName,
              },
              ...(reservationEntitled
                ? [
                    {
                      title: t("admin.reservationSettings.title"),
                      href: "/(admin)/reservation-settings",
                      icon: "calendar-edit" as MaterialCommunityIconName,
                    },
                  ]
                : []),
            ]
          : []),
      ],
    },
  ];

  const activeHref = useMemo(() => {
    const allItems = menuSections.flatMap((s) => [
      ...s.items,
      ...(s.groups ? s.groups.flatMap((g) => g.items) : []),
    ]);
    const matches = allItems.filter((i) => isActivePath(i.href));
    if (matches.length === 0) return null;
    matches.sort((a, b) => b.href.length - a.href.length);
    return matches[0].href;
  }, [menuSections, normalizedPath]);

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
  }, [menuSections, activeHref]);

  const visibleSections = menuSections.filter(
    (s) => s.items.length > 0 || (s.groups && s.groups.some((g) => g.items.length > 0))
  );

  const [shouldRender, setShouldRender] = useState(false);
  const slideAnim = useRef(new Animated.Value(-280)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Stop any ongoing animations
      slideAnim.stopAnimation();
      fadeAnim.stopAnimation();

      // Always reset to starting position when opening
      slideAnim.setValue(-280);
      fadeAnim.setValue(0);

      // Small delay to ensure values are set before animation starts
      requestAnimationFrame(() => {
        // Animate drawer sliding from left with smooth easing
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 250,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else if (shouldRender) {
      // Animate drawer sliding back to left when closing
      slideAnim.stopAnimation();
      fadeAnim.stopAnimation();

      // Small delay to ensure smooth animation
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: -280,
            duration: 300,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 250,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Only unmount after animation completes
          setShouldRender(false);
        });
      });
    }
  }, [isOpen, shouldRender]);

  const handleNavigate = (href: string) => {
    router.push(href as any);
    onClose();
  };

  const handleBackToSite = () => {
    router.replace("/(tabs)");
    onClose();
  };

  const handleLogout = async () => {
    try {
      // Navigate away from the admin stack first so screens don't fire org-scoped
      // requests while logout is in progress.
      onClose();
      router.replace("/(tabs)");

      await signOut();

      // Clear any persisted organization selection after logout.
      await clearSelectedOrganizationId();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (!shouldRender && !isOpen) {
    return null;
  }

  return (
    <Modal
      visible={shouldRender || isOpen}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlayContainer}>
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
            <View style={styles.headerIcon}>
              <MaterialCommunityIcons name="cog" size={16} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>
              {t("admin.sidebar.adminPanel")}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Navigation */}
          <ScrollView
            style={styles.navContainer}
            contentContainerStyle={styles.navContent}
            showsVerticalScrollIndicator={false}
          >
            {visibleSections.map((section) => (
              <View key={section.titleKey} style={styles.section}>
                <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text>
                {section.items.map((item) => {
                  const isActive = activeHref === item.href;
                  return (
                    <TouchableOpacity
                      key={item.href}
                      style={[
                        styles.menuItem,
                        isActive && styles.menuItemActive,
                      ]}
                      onPress={() => handleNavigate(item.href)}
                    >
                      <View
                        style={[
                          styles.activeBar,
                          isActive && styles.activeBarVisible,
                        ]}
                      />
                      <MaterialCommunityIcons
                        name={item.icon}
                        size={16}
                        color={isActive ? "#fff" : "#D1D5DB"}
                      />
                      <Text
                        style={[
                          styles.menuItemText,
                          isActive && styles.menuItemTextActive,
                        ]}
                      >
                        {item.title}
                      </Text>
                      {isActive && (
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={14}
                          color="#ec4899"
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}

                {section.groups?.map((group) => {
                  if (group.items.length === 0) return null;
                  const isExpanded = Boolean(expandedGroups[group.id]);
                  const groupHasActiveRoute = hasActiveRoute(group.items);
                  return (
                    <View key={group.id} style={{ marginTop: 6 }}>
                      <TouchableOpacity
                        style={[styles.groupHeader, groupHasActiveRoute && styles.groupHeaderActive]}
                        onPress={() => toggleGroup(group.id)}
                      >
                        <View style={styles.groupHeaderLeft}>
                          <MaterialCommunityIcons
                            name={group.icon}
                            size={16}
                            color={groupHasActiveRoute ? "#fff" : "#D1D5DB"}
                          />
                          <Text style={[styles.groupHeaderText, groupHasActiveRoute && styles.groupHeaderTextActive]} numberOfLines={1}>
                            {group.title}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name="chevron-down"
                          size={16}
                          color={groupHasActiveRoute ? "#fff" : "#9CA3AF"}
                          style={{ transform: [{ rotate: isExpanded ? "180deg" : "0deg" }] }}
                        />
                      </TouchableOpacity>

                      {isExpanded ? (
                        <View style={styles.groupItemsWrap}>
                          {group.items.map((item) => {
                            const isActive = activeHref === item.href;
                            return (
                              <TouchableOpacity
                                key={item.href}
                                style={[styles.menuItem, styles.groupItem, isActive && styles.menuItemActive]}
                                onPress={() => handleNavigate(item.href)}
                              >
                                <View style={[styles.activeBar, isActive && styles.activeBarVisible]} />
                                <MaterialCommunityIcons
                                  name={item.icon}
                                  size={16}
                                  color={isActive ? "#fff" : "#D1D5DB"}
                                />
                                <Text
                                  style={[styles.menuItemText, isActive && styles.menuItemTextActive]}
                                  numberOfLines={1}
                                >
                                  {item.title}
                                </Text>
                                {isActive && (
                                  <MaterialCommunityIcons name="chevron-right" size={14} color="#ec4899" />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {/* Admin User Info */}
            <View style={styles.userInfo}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {user?.firstName?.charAt(0) || "A"}
                </Text>
              </View>
              <View style={styles.userDetails}>
                <Text style={styles.userName}>
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : t("admin.sidebar.adminUser")}
                </Text>
                <Text style={styles.userEmail}>
                  {user?.emailAddresses?.[0]?.emailAddress ||
                    "admin@example.com"}
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              style={styles.footerButton}
              onPress={handleBackToSite}
            >
              <MaterialCommunityIcons name="arrow-left" size={16} color="#D1D5DB" />
              <Text style={styles.footerButtonText}>
                {t("admin.sidebar.backToSite")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.footerButton, styles.logoutButton]}
              onPress={handleLogout}
            >
              <MaterialCommunityIcons
                name="logout"
                size={16}
                color="#F87171"
              />
              <Text style={[styles.footerButtonText, styles.logoutButtonText]}>
                {t("admin.sidebar.logout")}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 300,
    maxWidth: "80%",
    height: "100%",
    backgroundColor: "#171717", // neutral-900
    borderRightWidth: 1,
    borderRightColor: "#404040", // neutral-700
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#404040",
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  navContainer: {
    flex: 1,
  },
  navContent: {
    padding: 16,
  },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
    overflow: "hidden",
  },
  menuItemActive: {
    backgroundColor: "rgba(236, 72, 153, 0.2)",
    borderWidth: 1,
    borderColor: "#ec4899",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: "transparent",
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  activeBarVisible: { backgroundColor: "#ec4899" },
  menuItemText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  menuItemTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  groupHeaderActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  groupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  groupHeaderText: {
    color: "#D1D5DB",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  groupHeaderTextActive: {
    color: "#fff",
  },
  groupItemsWrap: {
    marginTop: 6,
    marginLeft: 10,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.08)",
  },
  groupItem: {
    marginTop: 6,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#404040",
    gap: 12,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatarText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
  },
  userEmail: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  footerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  footerButtonText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  logoutButton: {
    borderTopWidth: 0,
  },
  logoutButtonText: {
    color: "#F87171",
  },
});
