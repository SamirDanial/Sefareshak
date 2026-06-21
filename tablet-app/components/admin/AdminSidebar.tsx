import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useClerk, useUser } from '@clerk/clerk-expo';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';

import { useAuthRole } from '@/src/contexts/AuthContext';
import { useAppMode } from '@/src/contexts/AppModeContext';
import { usePermissions } from '@/src/contexts/PermissionContext';
import { useOrganization } from '@/src/contexts/OrganizationContext';
import { ACTIONS, RESOURCES } from '@/src/utils/permissions';

type MaterialCommunityIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  titleKey: string;
  href: string;
  icon: MaterialCommunityIconName;
}

interface MenuSection {
  titleKey: string;
  items: MenuItem[];
  groups?: {
    id: string;
    titleKey: string;
    icon: MaterialCommunityIconName;
    items: MenuItem[];
  }[];
}

export function getAdminSidebarTitleForPath(
  pathname: string,
  t: (key: string, options?: any) => string
): string {
  const normalizedPath = pathname
    ? pathname
        .split('?')[0]
        .replace(/^\/\([^/]+\)/, '')
        .replace(/\/+$/, '')
    : '';

  if (normalizedPath === '/business-day/closed' || normalizedPath.startsWith('/business-day/closed/')) {
    return t('admin.businessDayClosedDays.title');
  }

  if (normalizedPath.startsWith('/staff-user')) return t('admin.staffManagement.title');

  const isActivePath = (itemHref: string) => {
    const itemPath = itemHref
      .split('?')[0]
      .replace(/^\/\([^/]+\)/, '')
      .replace(/\/+$/, '');
    const isDashboard = itemPath === '' || itemPath === '/';
    if (isDashboard) return normalizedPath === '' || normalizedPath === '/';
    return normalizedPath === itemPath || normalizedPath.startsWith(itemPath + '/');
  };

  for (const section of ADMIN_SIDEBAR_ROUTES) {
    for (const item of section.items) {
      if (isActivePath(item.href)) return t(item.titleKey);
    }
    for (const group of section.groups || []) {
      for (const item of group.items) {
        if (isActivePath(item.href)) return t(item.titleKey);
      }
    }
  }

  if (normalizedPath === '' || normalizedPath === '/') return t('admin.dashboard.title');
  const seg = normalizedPath.split('/').filter(Boolean)[0] || '';
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const ADMIN_SIDEBAR_ROUTES: MenuSection[] = [
  {
    titleKey: 'admin.sidebar.overview',
    items: [
      {
        titleKey: 'admin.dashboard.title',
        href: '/(admin)',
        icon: 'view-dashboard' as MaterialCommunityIconName,
      },
    ],
  },
  {
    titleKey: 'admin.sidebar.management',
    items: [],
    groups: [
      {
        id: 'orders',
        titleKey: 'admin.sidebar.groups.orders',
        icon: 'clipboard-list-outline' as MaterialCommunityIconName,
        items: [
          {
            titleKey: 'admin.pos.title',
            href: '/(admin)/pos',
            icon: 'cash-register' as MaterialCommunityIconName,
          },
          // {
          //   titleKey: 'admin.posDineIn.title',
          //   href: '/(admin)/pos-dine-in',
          //   icon: 'silverware-fork-knife' as MaterialCommunityIconName,
          // },
          {
            titleKey: 'admin.orderManagement.title',
            href: '/(admin)/orders',
            icon: 'clipboard-list-outline' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.reservationManagement.title',
            href: '/(admin)/reservation-management',
            icon: 'calendar-clock' as MaterialCommunityIconName,
          },
        ],
      },
      {
        id: 'menu',
        titleKey: 'admin.sidebar.groups.menu',
        icon: 'food' as MaterialCommunityIconName,
        items: [
          {
            titleKey: 'admin.menuManagement.title',
            href: '/(admin)/menu',
            icon: 'food' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.dealManagement.title',
            href: '/(admin)/deals',
            icon: 'tag' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.categoryManagement.title',
            href: '/(admin)/categories',
            icon: 'shape' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.addonManagement.title',
            href: '/(admin)/addons',
            icon: 'plus-box-multiple' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.optionalIngredientManagement.title',
            href: '/(admin)/optional-ingredients',
            icon: 'food-variant' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.declarationManagement.title',
            href: '/(admin)/declarations',
            icon: 'tag-multiple' as MaterialCommunityIconName,
          },
        ],
      },
      {
        id: 'tables',
        titleKey: 'admin.sidebar.groups.tables',
        icon: 'table-furniture' as MaterialCommunityIconName,
        items: [
          {
            titleKey: 'admin.tableManagement.title',
            href: '/(admin)/table-management',
            icon: 'table-furniture' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.zoneManagement.title',
            href: '/(admin)/zone-management',
            icon: 'map-marker-radius' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.pageTitles.tableStatusGrid',
            href: '/(admin)/table-status-grid',
            icon: 'grid' as MaterialCommunityIconName,
          },
        ],
      },
      {
        id: 'people',
        titleKey: 'admin.sidebar.groups.people',
        icon: 'account-group' as MaterialCommunityIconName,
        items: [
          {
            titleKey: 'admin.myStaff.title',
            href: '/(admin)/my-staff',
            icon: 'account-supervisor' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.userManagement.title',
            href: '/(admin)/users',
            icon: 'account-group' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.pageTitles.branchLikes',
            href: '/(admin)/branch-likes',
            icon: 'account-heart-outline' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.staffManagement.title',
            href: '/(admin)/staff-management',
            icon: 'account-tie' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.roleManagement.title',
            href: '/(admin)/role-management',
            icon: 'shield-account' as MaterialCommunityIconName,
          },
        ],
      },
      {
        id: 'branches',
        titleKey: 'admin.sidebar.groups.branches',
        icon: 'store' as MaterialCommunityIconName,
        items: [
          {
            titleKey: 'admin.pageTitles.branchManagement',
            href: '/(admin)/branch-management',
            icon: 'store' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.businessDay.endOfDayTitle',
            href: '/(admin)/business-day',
            icon: 'calendar-check' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.businessDayClosedDays.title',
            href: '/(admin)/business-day/closed',
            icon: 'calendar-multiple' as MaterialCommunityIconName,
          },
          {
            titleKey: 'admin.deliverableQuantities.title',
            href: '/(admin)/deliverable-quantities',
            icon: 'scale' as MaterialCommunityIconName,
          },
        ],
      },
    ],
  },
  {
    titleKey: 'admin.sidebar.content',
    items: [
      {
        titleKey: 'admin.heroSection.title',
        href: '/(admin)/hero-section',
        icon: 'image-multiple' as MaterialCommunityIconName,
      },
    ],
  },
  {
    titleKey: 'admin.sidebar.analytics',
    items: [
      {
        titleKey: 'admin.analytics.title',
        href: '/(admin)/analytics',
        icon: 'chart-bar' as MaterialCommunityIconName,
      },
      {
        titleKey: 'admin.categoryInsights.title',
        href: '/(admin)/insights',
        icon: 'chart-pie' as MaterialCommunityIconName,
      },
      {
        titleKey: 'admin.reservationAnalytics.title',
        href: '/(admin)/reservation-analytics',
        icon: 'chart-timeline-variant' as MaterialCommunityIconName,
      },
    ],
  },
  {
    titleKey: 'admin.sidebar.system',
    items: [
      {
        titleKey: 'admin.auditLogs.title',
        href: '/(admin)/audit-logs',
        icon: 'clipboard-text-clock-outline' as MaterialCommunityIconName,
      },
      {
        titleKey: 'admin.organizations.title',
        href: '/(admin)/organizations',
        icon: 'domain' as MaterialCommunityIconName,
      },
      {
        titleKey: 'admin.settings.title',
        href: '/(admin)/settings',
        icon: 'cog' as MaterialCommunityIconName,
      },
      {
        titleKey: 'admin.posDevices.title',
        href: '/(admin)/pos-devices',
        icon: 'tablet' as MaterialCommunityIconName,
      },
      {
        titleKey: 'admin.reservationSettings.title',
        href: '/(admin)/reservation-settings',
        icon: 'calendar-edit' as MaterialCommunityIconName,
      },
      {
        titleKey: 'admin.pageTitles.pushNotifications',
        href: '/(admin)/push-notifications',
        icon: 'bell' as MaterialCommunityIconName,
      },
      // {
      //   titleKey: 'admin.notificationSettings.title',
      //   href: '/(admin)/notification-settings',
      //   icon: 'bell-cog' as MaterialCommunityIconName,
      // },
      {
        titleKey: 'admin.termsAndPolicies.title',
        href: '/(admin)/terms-and-policies',
        icon: 'file-document-outline' as MaterialCommunityIconName,
      },
    ],
  },
];

export function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const { t } = useTranslation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { userType } = useAuthRole();
  const { can, canAny, rbacUser, isSuperAdmin: isSuperAdminFromPermissions, isLoading: permissionsLoading } = usePermissions();
  const { clearSelectedOrganizationId } = useOrganization();
  const { setAppMode } = useAppMode();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const statusBarHeight = insets.top;
  const viewerOrgRole = (rbacUser as any)?.orgRole as string | null | undefined;
  const isEffectiveSuperAdmin =
    userType === 'SUPER_ADMIN' ||
    isSuperAdminFromPermissions ||
    (rbacUser as any)?.userType === 'SUPER_ADMIN' ||
    (rbacUser as any)?.hasFullAccess === true;

  const reservationEntitled =
    isEffectiveSuperAdmin
      ? true
      : (rbacUser as any)?.organizationEntitlements?.reservationsAllowed !== false;

  const canViewStaffManagement =
    isEffectiveSuperAdmin || viewerOrgRole === 'ORG_OWNER' || viewerOrgRole === 'ORG_ADMIN';

  const canViewAuditLogs =
    isEffectiveSuperAdmin || viewerOrgRole === 'ORG_OWNER' || viewerOrgRole === 'ORG_ADMIN';

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isOffline, setIsOffline] = useState(false);
  const [showOfflineDialog, setShowOfflineDialog] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      const netInfo = await NetInfo.fetch();
      const offline = !(netInfo.isConnected && netInfo.isInternetReachable !== false);
      setIsOffline(offline);
    };

    checkConnection();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);
    });

    return () => unsubscribe();
  }, []);

  const normalizedPath = useMemo(() => {
    return pathname ? pathname.replace(/^\/\([^/]+\)/, '').replace(/\/+$/, '') : '';
  }, [pathname]);

  const isActivePath = useCallback((itemHref: string) => {
    const itemPath = itemHref.replace(/^\/\([^/]+\)/, '').replace(/\/+$/, '');
    const isDashboard = itemPath === '' || itemPath === '/';
    if (isDashboard) return normalizedPath === '' || normalizedPath === '/';
    return normalizedPath === itemPath || normalizedPath.startsWith(itemPath + '/');
  }, [normalizedPath]);

  const hasActiveRoute = useCallback((items: MenuItem[]) => items.some((i) => isActivePath(i.href)), [isActivePath]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const canView = useCallback(
    (resource: keyof typeof RESOURCES) => {
      if (permissionsLoading) return false;
      return can(RESOURCES[resource], ACTIONS.VIEW);
    },
    [can, permissionsLoading]
  );

  const menuSections: MenuSection[] = useMemo(() => {
    const applyPermissions = (sections: MenuSection[]): MenuSection[] => {
      return sections
        .map((section) => {
          const nextItems = section.items.filter((item) => {
            if (item.href === '/(admin)') return canView('DASHBOARD');
            if (item.href === '/(admin)/hero-section') return canView('HERO_SECTIONS');
            if (item.href === '/(admin)/analytics') return canView('ANALYTICS') || canView('ANALYTICS_REVENUE');
            if (item.href === '/(admin)/insights') return canView('ANALYTICS') || canView('ANALYTICS_CATEGORY_INSIGHTS');
            if (item.href === '/(admin)/reservation-analytics')
              return reservationEntitled && (canView('ANALYTICS') || canView('ANALYTICS_RESERVATION'));
            if (item.href === '/(admin)/audit-logs') return canViewAuditLogs;
            if (item.href === '/(admin)/organizations') return isEffectiveSuperAdmin;
            if (item.href === '/(admin)/settings') return isEffectiveSuperAdmin || viewerOrgRole === 'ORG_OWNER' || viewerOrgRole === 'ORG_ADMIN';
            if (item.href === '/(admin)/pos-devices') return isEffectiveSuperAdmin || viewerOrgRole === 'ORG_OWNER' || viewerOrgRole === 'ORG_ADMIN';
            if (item.href === '/(admin)/reservation-settings')
              return reservationEntitled && (isEffectiveSuperAdmin || viewerOrgRole === 'ORG_OWNER' || viewerOrgRole === 'ORG_ADMIN');
            if (item.href === '/(admin)/push-notifications') return isEffectiveSuperAdmin || viewerOrgRole === 'ORG_OWNER' || viewerOrgRole === 'ORG_ADMIN';
            if (item.href === '/(admin)/terms-and-policies') return isEffectiveSuperAdmin;
            return true;
          });

          const nextGroups = section.groups
            ?.map((group) => {
              const nextGroupItems = group.items.filter((item) => {
                if (item.href === '/(admin)/pos' || item.href === '/(admin)/pos-dine-in')
                  return canAny([
                    { resource: RESOURCES.ORDERS, action: ACTIONS.CREATE },
                    { resource: RESOURCES.ORDERS, action: ACTIONS.VIEW },
                  ]);
                if (item.href === '/(admin)/orders') return canView('ORDERS');
                if (item.href === '/(admin)/reservation-management') return reservationEntitled && canView('RESERVATIONS');
                if (item.href === '/(admin)/menu') return canView('MENU');
                if (item.href === '/(admin)/deals') return canView('DEALS');
                if (item.href === '/(admin)/categories') return canView('CATEGORIES');
                if (item.href === '/(admin)/addons') return canView('ADDONS');
                if (item.href === '/(admin)/optional-ingredients') return canView('OPTIONAL_INGREDIENTS');
                if (item.href === '/(admin)/declarations') return canView('DECLARATIONS');
                if (item.href === '/(admin)/table-management') return reservationEntitled && canView('TABLES');
                if (item.href === '/(admin)/zone-management') return reservationEntitled && canView('ZONES');
                if (item.href === '/(admin)/table-status-grid') return reservationEntitled && canView('TABLE_STATUS_GRID');
                if (item.href === '/(admin)/my-staff') return userType === 'BRANCH_ADMIN';
                if (item.href === '/(admin)/users') return isEffectiveSuperAdmin;
                if (item.href === '/(admin)/staff-management')
                  return isEffectiveSuperAdmin || canViewStaffManagement;
                if (item.href === '/(admin)/role-management')
                  return isEffectiveSuperAdmin || viewerOrgRole === 'ORG_OWNER';
                if (item.href === '/(admin)/branch-management') return canView('BRANCHES');
                if (item.href === '/(admin)/business-day')
                  return canAny([
                    { resource: RESOURCES.END_OF_DAY, action: ACTIONS.VIEW },
                    { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
                  ]);
                if (item.href === '/(admin)/business-day/closed')
                  return canAny([
                    { resource: RESOURCES.CLOSED_DAYS, action: ACTIONS.VIEW },
                    { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
                  ]);
                if (item.href === '/(admin)/deliverable-quantities')
                  return canAny([
                    { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.VIEW },
                    { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.MANAGE },
                  ]);
                return true;
              });

              return { ...group, items: nextGroupItems };
            })
            .filter((g) => Array.isArray(g.items) && g.items.length > 0);

          return { ...section, items: nextItems, groups: nextGroups };
        })
        .filter((section) => section.items.length > 0 || (section.groups && section.groups.length > 0));
    };

    return applyPermissions(ADMIN_SIDEBAR_ROUTES);
  }, [
    canAny,
    canView,
    canViewAuditLogs,
    canViewStaffManagement,
    isEffectiveSuperAdmin,
    reservationEntitled,
    userType,
    viewerOrgRole,
  ]);

  const activeHref = useMemo(() => {
    const allItems = menuSections.flatMap((s) => [
      ...s.items,
      ...(s.groups ? s.groups.flatMap((g) => g.items) : []),
    ]);
    const matches = allItems.filter((i) => isActivePath(i.href));
    if (matches.length === 0) return null;
    matches.sort((a, b) => b.href.length - a.href.length);
    return matches[0].href;
  }, [isActivePath, menuSections]);

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
  }, [menuSections, activeHref, hasActiveRoute]);

  const visibleSections = menuSections.filter(
    (s) => s.items.length > 0 || (s.groups && s.groups.some((g) => g.items.length > 0))
  );

  const [shouldRender, setShouldRender] = useState(false);
  const slideAnim = useRef(new Animated.Value(-280)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      slideAnim.stopAnimation();
      fadeAnim.stopAnimation();

      slideAnim.setValue(-280);
      fadeAnim.setValue(0);

      requestAnimationFrame(() => {
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
      slideAnim.stopAnimation();
      fadeAnim.stopAnimation();

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
          setShouldRender(false);
        });
      });
    }
  }, [isOpen, shouldRender, fadeAnim, slideAnim]);

  const handleNavigate = (href: string) => {
    if (isOffline) {
      const allowedOfflineHrefs = ['/(admin)', '/(admin)/pos', '/(admin)/orders'];
      if (!allowedOfflineHrefs.includes(href)) {
        setShowOfflineDialog(true);
        return;
      }
    }
    router.push(href as any);
    onClose();
  };

  const handleSwitchToPOS = async () => {
    try {
      await setAppMode('pos');
      onClose();
      router.replace('/(admin)/pos' as any);
    } catch (error) {
      console.error('Error switching to POS mode:', error);
    }
  };

  const handleLogout = async () => {
    try {
      onClose();
      await signOut();
      await clearSelectedOrganizationId();
      router.replace('/(auth)/sign-in' as any);
    } catch (error) {
      console.error('Error signing out:', error);
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
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlayContainer}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
        >
          <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
            <View style={styles.headerIcon}>
              <MaterialCommunityIcons name="cog" size={16} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>{t('admin.panel')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.navContainer}
            contentContainerStyle={[styles.navContent, { paddingBottom: 12 + Math.max(insets.bottom, 0) }]}
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
                      style={[styles.menuItem, isActive && styles.menuItemActive]}
                      onPress={() => handleNavigate(item.href)}
                    >
                      <View style={[styles.activeBar, isActive && styles.activeBarVisible]} />
                      <MaterialCommunityIcons
                        name={item.icon}
                        size={16}
                        color={isActive ? '#ec4899' : '#6b7280'}
                      />
                      <Text style={[styles.menuItemText, isActive && styles.menuItemTextActive]}>
                        {t(item.titleKey)}
                      </Text>
                      {isActive && (
                        <MaterialCommunityIcons name="chevron-right" size={14} color="#ec4899" />
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
                            color={groupHasActiveRoute ? '#ec4899' : '#6b7280'}
                          />
                          <Text
                            style={[styles.groupHeaderText, groupHasActiveRoute && styles.groupHeaderTextActive]}
                            numberOfLines={1}
                          >
                            {t(group.titleKey)}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name="chevron-down"
                          size={16}
                          color={groupHasActiveRoute ? '#ec4899' : '#9ca3af'}
                          style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
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
                                  color={isActive ? '#ec4899' : '#6b7280'}
                                />
                                <Text
                                  style={[styles.menuItemText, isActive && styles.menuItemTextActive]}
                                  numberOfLines={1}
                                >
                                  {t(item.titleKey)}
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

          <View style={[styles.footer, { paddingBottom: 16 + Math.max(insets.bottom, 0) }]}>
            <View style={styles.userInfo}>
              <View style={styles.userAvatar}>
                {user?.imageUrl ? (
                  <Image
                    source={{ uri: user.imageUrl }}
                    style={styles.userAvatarImage}
                  />
                ) : (
                  <Text style={styles.userAvatarText}>
                    {user?.firstName?.charAt(0) ||
                      user?.emailAddresses?.[0]?.emailAddress
                        ?.charAt(0)
                        .toUpperCase() ||
                      'A'}
                  </Text>
                )}
              </View>
              <View style={styles.userDetails}>
                <Text style={styles.userName}>
                  {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Admin'}
                </Text>
                <Text style={styles.userEmail}>
                  {user?.emailAddresses?.[0]?.emailAddress || ''}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.footerButton, styles.switchPosButton]} onPress={handleSwitchToPOS}>
              <MaterialCommunityIcons name="cash-register" size={16} color="#ec4899" />
              <Text style={[styles.footerButtonText, styles.switchPosButtonText]}>{t('admin.sidebar.switchToPOS')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.footerButton, styles.logoutButton]} onPress={handleLogout}>
              <MaterialCommunityIcons name="logout" size={16} color="#F87171" />
              <Text style={[styles.footerButtonText, styles.logoutButtonText]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      {/* OFFLINE DIALOG */}
      <Modal
        visible={showOfflineDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOfflineDialog(false)}
      >
        <Pressable
          style={styles.offlineDialogOverlay}
          onPress={() => setShowOfflineDialog(false)}
        >
          <Pressable style={styles.offlineDialogContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.offlineDialogHandle} />
            <View style={styles.offlineDialogContent}>
              <MaterialCommunityIcons name="wifi-off" size={48} color="#ec4899" />
              <Text style={styles.offlineDialogTitle}>
                {t('admin.pos.menuOfflineTitle', { defaultValue: 'Feature Not Available Offline' })}
              </Text>
              <Text style={styles.offlineDialogMessage}>
                {t('admin.pos.menuOfflineMessage', { defaultValue: 'This feature requires an internet connection. Please connect to the internet to use it.' })}
              </Text>
              <TouchableOpacity
                style={styles.offlineDialogButton}
                onPress={() => setShowOfflineDialog(false)}
              >
                <Text style={styles.offlineDialogButtonText}>
                  {t('common.ok', { defaultValue: 'OK' })}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 300,
    maxWidth: '80%',
    height: '100%',
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
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
    color: '#6b7280',
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
    overflow: 'hidden',
  },
  menuItemActive: {
    backgroundColor: 'rgba(236, 72, 153, 0.05)',
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: 'transparent',
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  activeBarVisible: { backgroundColor: '#ec4899' },
  menuItemText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  menuItemTextActive: {
    color: '#ec4899',
    fontWeight: '600',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  groupHeaderActive: {
    backgroundColor: 'rgba(236, 72, 153, 0.05)',
    borderColor: 'rgba(236, 72, 153, 0.2)',
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  groupHeaderText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  groupHeaderTextActive: {
    color: '#111827',
  },
  groupItemsWrap: {
    marginTop: 6,
    marginLeft: 10,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
  },
  groupItem: {
    marginTop: 6,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  userAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  userEmail: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  footerButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  switchPosButton: {
    backgroundColor: 'rgba(236, 72, 153, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.25)',
    marginBottom: 4,
  },
  switchPosButtonText: {
    color: '#ec4899',
  },
  logoutButton: {
    borderTopWidth: 0,
  },
  logoutButtonText: {
    color: '#F87171',
  },
  // Offline dialog styles
  offlineDialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  offlineDialogContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: '100%',
    maxWidth: 400,
  },
  offlineDialogHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  offlineDialogContent: {
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  offlineDialogTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  offlineDialogMessage: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  offlineDialogButton: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
    width: '100%',
  },
  offlineDialogButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
