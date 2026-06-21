import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AdminSidebar, getAdminSidebarTitleForPath } from '@/components/admin/AdminSidebar';
import AdminHeader from '@/components/admin/AdminHeader';
import { useAuthRole } from '@/src/contexts/AuthContext';
import { useAppMode } from '@/src/contexts/AppModeContext';
import { useOrganization } from '@/src/contexts/OrganizationContext';
import { usePermissions } from '@/src/contexts/PermissionContext';
import { PosDeviceProvider } from '@/src/contexts/PosDeviceContext';
import { BranchProvider } from '@/src/contexts/BranchContext';
import branchService from '@/src/services/branchService';

const HEADER_HEIGHT = 56;

export function getAdminHeaderHeight(): number {
  return HEADER_HEIGHT;
}

export default function AdminLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { userType, getToken, isLoading: authLoading } = useAuthRole();
  const { rbacUser, isOrgAdmin, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { selectedOrganizationId, setSelectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const { isPosOnlyMode } = useAppMode();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const didAutoSelectOrgRef = useRef(false);
  const didPrefetchOrganizationsRef = useRef(false);
  const selectedOrganizationIdRef = useRef<string | null>(null);
  const autoSelectRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSelectAttemptCountRef = useRef(0);

  const normalizedPath = useMemo(() => {
    return (pathname || '').split('?')[0].replace(/^\/\([^/]+\)/, '').replace(/\/+$/, '');
  }, [pathname]);

  const title = useMemo(() => getAdminSidebarTitleForPath(pathname || '', t), [pathname, t]);

  const isDashboardRoute = normalizedPath === '';
  const isPosRoute = normalizedPath === '/pos';
  const isPosDineInRoute = normalizedPath === '/pos-dine-in';
  const isOrdersRoute = normalizedPath === '/orders';
  const isReservationManagementRoute = normalizedPath === '/reservation-management';
  const isMenuManagementRoute = normalizedPath === '/menu';
  const isDealsRoute = normalizedPath === '/deals';
  const isCategoriesRoute = normalizedPath === '/categories';
  const isAddonsRoute = normalizedPath === '/addons';
  const isOptionalIngredientsRoute = normalizedPath === '/optional-ingredients';
  const isDeclarationsRoute = normalizedPath === '/declarations';
  const isTableManagementRoute = normalizedPath === '/table-management';
  const isZoneManagementRoute = normalizedPath === '/zone-management';
  const isTableStatusGridRoute = normalizedPath === '/table-status-grid';
  const isUsersRoute = normalizedPath === '/users';
  const isStaffManagementRoute = normalizedPath === '/staff-management';
  const isStaffUserRoute = normalizedPath.startsWith('/staff-user');
  const isRoleManagementRoute = normalizedPath === '/role-management';
  const isBranchManagementRoute = normalizedPath === '/branch-management';
  const isBranchFormRoute = normalizedPath === '/branch-form';
  const isBranchReservationSettingsRoute = normalizedPath === '/branch-reservation-settings';
  const isBusinessDayRoute = normalizedPath === '/business-day';
  const isBusinessDayClosedDaysRoute = normalizedPath === '/business-day/closed';
  const isBusinessDayClosedDayDetailsRoute = normalizedPath.startsWith('/business-day/closed/');
  const isDeliverableQuantitiesRoute = normalizedPath === '/deliverable-quantities';
  const isHeroSectionRoute = normalizedPath === '/hero-section';
  const isSettingsRoute = normalizedPath === '/settings';
  const isAnalyticsRoute = normalizedPath === '/analytics';
  const isInsightsRoute = normalizedPath === '/insights';
  const isReservationAnalyticsRoute = normalizedPath === '/reservation-analytics';
  const isAuditLogsRoute = normalizedPath === '/audit-logs';
  const isOrganizationsRoute = normalizedPath === '/organizations';
  const isReservationSettingsRoute = normalizedPath === '/reservation-settings';
  const isPushNotificationsRoute = normalizedPath === '/push-notifications';
  const isTermsAndPoliciesRoute = normalizedPath === '/terms-and-policies';
  const isPolicyFormRoute = normalizedPath === '/policy-form';
  const isPosDevicesRoute = normalizedPath === '/pos-devices';
  const isBranchLikesRoute = normalizedPath === '/branch-likes';
  const isOrderDetailsRoute = normalizedPath === '/order-details';
  const isBillPreviewRoute = normalizedPath === '/bill-preview';
  const isRefundBillPreviewRoute = normalizedPath === '/refund-bill-preview';
  const isReservationDetailsRoute = normalizedPath === '/reservation-details';
  const isMealFormRoute = normalizedPath === '/meal-form';
  const isCategoryFormRoute = normalizedPath === '/category-form';
  const isCategoryOrderingRoute = normalizedPath === '/category-ordering';
  const isAddonFormRoute = normalizedPath === '/addon-form';
  const isOptionalIngredientFormRoute = normalizedPath === '/optional-ingredient-form';
  const isDeclarationFormRoute = normalizedPath === '/declaration-form';
  const isTableFormRoute = normalizedPath === '/table-form';
  const isDealFormRoute = normalizedPath === '/deal-form';
  const isDealCategoryOrderingRoute = normalizedPath === '/deal-category-ordering';
  const isCategoryDealOrderingRoute = normalizedPath === '/category-deal-ordering';
  const isFeaturedMealsOrderingRoute = normalizedPath === '/featured-meals-ordering';
  const isCategoryMealOrderingRoute = normalizedPath === '/category-meal-ordering';
  const isMealBranchAvailabilityRoute = normalizedPath === '/meal-branch-availability';
  const shouldShowOrgSwitcherInTitle =
    (userType === 'SUPER_ADMIN' || isSuperAdmin) &&
    (isDashboardRoute ||
      isPosRoute ||
      isPosDineInRoute ||
      isOrdersRoute ||
      isReservationManagementRoute ||
      isMenuManagementRoute ||
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
      isStaffUserRoute ||
      isRoleManagementRoute ||
      isBranchManagementRoute ||
      isBusinessDayRoute ||
      isBusinessDayClosedDaysRoute ||
      isDeliverableQuantitiesRoute ||
      isHeroSectionRoute ||
      isAnalyticsRoute ||
      isInsightsRoute ||
      isReservationAnalyticsRoute ||
      isAuditLogsRoute ||
      isOrganizationsRoute ||
      isReservationSettingsRoute ||
      isPushNotificationsRoute ||
      isTermsAndPoliciesRoute ||
      isPosDevicesRoute ||
      isBranchLikesRoute ||
      isSettingsRoute);

  const shouldHideAdminHeader =
    isOrderDetailsRoute ||
    isBillPreviewRoute ||
    isRefundBillPreviewRoute ||
    isReservationDetailsRoute ||
    isMealFormRoute ||
    isMealBranchAvailabilityRoute ||
    isCategoryFormRoute ||
    isCategoryOrderingRoute ||
    isBranchFormRoute ||
    isBranchReservationSettingsRoute ||
    isPolicyFormRoute ||
    isBusinessDayClosedDayDetailsRoute ||
    isAddonFormRoute ||
    isDeclarationFormRoute ||
    isTableFormRoute ||
    isDealFormRoute ||
    isDealCategoryOrderingRoute ||
    isCategoryDealOrderingRoute ||
    isFeaturedMealsOrderingRoute ||
    isCategoryMealOrderingRoute ||
    isOptionalIngredientFormRoute;

  useEffect(() => {
    if (!clerkLoaded) return;
    if (!isSignedIn) {
      router.replace('/(auth)/sign-in' as any);
      return;
    }

    if (authLoading || permissionsLoading) return;

    const rbacUserType = (rbacUser as any)?.userType as string | null | undefined;
    const effectiveUserType = rbacUserType || userType;

    if (!effectiveUserType && !isOrgAdmin) {
      return;
    }
    const allowed = Boolean(isOrgAdmin || (effectiveUserType && effectiveUserType !== 'USER'));
    if (!allowed) {
      router.replace('/no-access' as any);
    }
  }, [authLoading, clerkLoaded, isOrgAdmin, isSignedIn, permissionsLoading, rbacUser, router, userType]);

  useEffect(() => {
    selectedOrganizationIdRef.current = selectedOrganizationId;
  }, [selectedOrganizationId]);

  useEffect(() => {
    if (!clerkLoaded || !isSignedIn) {
      didPrefetchOrganizationsRef.current = false;
      return;
    }
    if (authLoading || permissionsLoading || organizationLoading) return;

    const rbacUserType = (rbacUser as any)?.userType as string | null | undefined;
    const effectiveUserType = rbacUserType || userType;
    const showAsSuperAdmin = effectiveUserType === 'SUPER_ADMIN' || isSuperAdmin;
    if (!showAsSuperAdmin) return;
    if (didPrefetchOrganizationsRef.current) return;

    didPrefetchOrganizationsRef.current = true;

    const run = async () => {
      const token = await getToken();
      if (!token) return;
      await branchService.prefetchOrganizations(token);
    };

    void run();
  }, [authLoading, clerkLoaded, getToken, isSignedIn, isSuperAdmin, organizationLoading, permissionsLoading, rbacUser, userType]);

  useEffect(() => {
    if (!clerkLoaded) return;
    if (!isSignedIn) {
      didAutoSelectOrgRef.current = false;
      autoSelectAttemptCountRef.current = 0;
      if (autoSelectRetryTimeoutRef.current) {
        clearTimeout(autoSelectRetryTimeoutRef.current);
        autoSelectRetryTimeoutRef.current = null;
      }
      return;
    }
    if (authLoading || permissionsLoading || organizationLoading) return;

    const rbacUserType = (rbacUser as any)?.userType as string | null | undefined;
    const effectiveUserType = rbacUserType || userType;
    const showAsSuperAdmin = effectiveUserType === 'SUPER_ADMIN' || isSuperAdmin;
    if (!showAsSuperAdmin) return;
    if (selectedOrganizationId) return;
    if (didAutoSelectOrgRef.current) return;

    let cancelled = false;

    const tryAutoSelect = async () => {
      if (cancelled) return;
      if (selectedOrganizationIdRef.current) return;
      if (didAutoSelectOrgRef.current) return;

      if (autoSelectAttemptCountRef.current >= 5) {
        return;
      }

      autoSelectAttemptCountRef.current += 1;

      try {
        const token = await getToken();
        if (!token || cancelled) {
          throw new Error('Missing token');
        }

        const orgs = await branchService.getOrganizations(token);
        if (cancelled) return;
        if (selectedOrganizationIdRef.current) return;

        const first = Array.isArray(orgs) ? orgs[0] : null;
        const nextId = String((first as any)?.id || '').trim();
        if (!nextId) {
          throw new Error('No organizations');
        }
        const nextName = (first as any)?.name ?? null;

        await setSelectedOrganizationId(nextId, nextName);
        didAutoSelectOrgRef.current = true;
      } catch {
        if (cancelled) return;
        if (selectedOrganizationIdRef.current) return;
        autoSelectRetryTimeoutRef.current = setTimeout(() => {
          void tryAutoSelect();
        }, 1000);
      }
    };

    void tryAutoSelect();

    return () => {
      cancelled = true;
      if (autoSelectRetryTimeoutRef.current) {
        clearTimeout(autoSelectRetryTimeoutRef.current);
        autoSelectRetryTimeoutRef.current = null;
      }
    };
  }, [authLoading, clerkLoaded, getToken, isSignedIn, isSuperAdmin, organizationLoading, permissionsLoading, rbacUser, selectedOrganizationId, setSelectedOrganizationId, userType]);

  return (
    <BranchProvider organizationId={selectedOrganizationId}>
    <PosDeviceProvider>
      <>
        <StatusBar style="dark" />

        {!shouldHideAdminHeader ? (
          <>
            <View style={[styles.headerWrap, { paddingTop: insets.top, height: insets.top + HEADER_HEIGHT }]}>
              <AdminHeader
                title={title}
                onMenuPress={() => setSidebarOpen(true)}
                shouldShowOrgSwitcherInTitle={shouldShowOrgSwitcherInTitle}
                shouldHideAdminHeader={shouldHideAdminHeader}
                hideMenuButton={isPosOnlyMode}
              />
            </View>

            {!isPosOnlyMode && <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
          </>
        ) : null}

        <View
          style={{
            flex: 1,
            marginTop: shouldHideAdminHeader ? 0 : insets.top + HEADER_HEIGHT,
            paddingBottom: insets.bottom,
            backgroundColor: '#f9fafb',
          }}
        >
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#f9fafb' },
            }}
          />
        </View>
      </>
    </PosDeviceProvider>
    </BranchProvider>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    zIndex: 10,
  },
});
