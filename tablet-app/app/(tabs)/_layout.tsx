import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

import { useAuthRole } from '@/src/contexts/AuthContext';
import { usePermissions } from '@/src/contexts/PermissionContext';

export default function TabLayout() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { userType, isLoading: authRoleLoading } = useAuthRole();
  const { rbacUser, isOrgAdmin, isLoading: permissionsLoading } = usePermissions();

  const entitled = useMemo(() => {
    const rbacUserType = (rbacUser as any)?.userType as string | null | undefined;
    const effectiveUserType = rbacUserType || userType;
    return Boolean(isOrgAdmin || (effectiveUserType && effectiveUserType !== 'USER'));
  }, [isOrgAdmin, rbacUser, userType]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.replace('/(auth)/sign-in' as any);
      return;
    }

    if (authRoleLoading || permissionsLoading) return;

    if (entitled) {
      router.replace('/(admin)' as any);
    } else {
      router.replace('/no-access' as any);
    }
  }, [authRoleLoading, entitled, isLoaded, isSignedIn, permissionsLoading, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
      <ActivityIndicator />
    </View>
  );
}
