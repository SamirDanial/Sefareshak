import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useClerk } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuthRole } from '@/src/contexts/AuthContext';
import { usePermissions } from '@/src/contexts/PermissionContext';
import ApiService from '@/src/services/apiService';

export default function Index() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { userType, isLoading: authRoleLoading } = useAuthRole();
  const { rbacUser, isOrgAdmin, isLoading: permissionsLoading, error: permissionsError, refreshPermissions } = usePermissions();

  const [watchdogTripped, setWatchdogTripped] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [appMode, setAppMode] = useState<string | null | undefined>(undefined);
  const appModeReadRef = useRef(false);

  useEffect(() => {
    if (appModeReadRef.current) return;
    appModeReadRef.current = true;
    AsyncStorage.getItem('appMode').then((value) => {
      setAppMode(value ?? null);
    }).catch(() => {
      setAppMode(null);
    });
  }, []);

  const effectiveUserType = useMemo(() => {
    const rbacUserType = (rbacUser as any)?.userType as string | null | undefined;
    return rbacUserType || userType;
  }, [rbacUser, userType]);

  const isEntitlementUnknown = useMemo(() => {
    if (!isLoaded || !isSignedIn) return false;
    if (authRoleLoading || permissionsLoading) return false;
    return !isOrgAdmin && !effectiveUserType;
  }, [authRoleLoading, effectiveUserType, isLoaded, isOrgAdmin, isSignedIn, permissionsLoading]);

  const isStillLoading = useMemo(() => {
    return !isLoaded || (isSignedIn && (authRoleLoading || permissionsLoading || isEntitlementUnknown));
  }, [authRoleLoading, isEntitlementUnknown, isLoaded, isSignedIn, permissionsLoading]);

  useEffect(() => {
    if (!isSignedIn) {
      setWatchdogTripped(false);
      return;
    }

    if (!isStillLoading) {
      setWatchdogTripped(false);
      return;
    }

    const t = setTimeout(() => {
      setWatchdogTripped(true);
    }, 25000);

    return () => clearTimeout(t);
  }, [isSignedIn, isStillLoading, retryKey]);

  const handleRetry = useCallback(async () => {
    setWatchdogTripped(false);
    try {
      await refreshPermissions();
    } catch {
      // ignore
    }
    setRetryKey((k) => k + 1);
  }, [refreshPermissions]);

  const handleLogout = useCallback(async () => {
    try {
      // Prevent new API calls during logout
      console.log('=== Logout Debug ===');
      console.log('Setting logout state to true');
      ApiService.setLoggingOut(true);
      await signOut();
    } finally {
      router.replace('/(auth)/sign-in' as any);
    }
  }, [router, signOut]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.replace('/(auth)/sign-in' as any);
      return;
    }

    if (authRoleLoading || permissionsLoading) return;

    if (!effectiveUserType && !isOrgAdmin) {
      return;
    }

    const entitled = Boolean(isOrgAdmin || (effectiveUserType && effectiveUserType !== 'USER'));

    if (entitled) {
      if (appMode === undefined) return;
      if (appMode === 'pos') {
        router.replace('/(admin)/pos' as any);
      } else if (appMode === 'management') {
        router.replace('/(admin)' as any);
      } else {
        router.replace('/mode-select' as any);
      }
      return;
    }

    // Signed in but not entitled: route to no-access.
    // Do not auto sign-out here; permission/userType fetches can transiently fail (network/background)
    // and we don't want that to log the user out.
    router.replace('/no-access' as any);
  }, [isLoaded, isSignedIn, authRoleLoading, permissionsLoading, isOrgAdmin, effectiveUserType, router, retryKey, appMode]);

  if (isSignedIn && watchdogTripped) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f5f5f5' }}>
        <Text style={{ color: '#111827', fontSize: 16, fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>
          Loading your account is taking longer than expected
        </Text>
        <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 18, textAlign: 'center' }}>
          {permissionsError || 'Please check your internet connection and try again.'}
        </Text>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            onPress={handleRetry}
            style={{ backgroundColor: '#ec4899', paddingHorizontal: 16, height: 44, borderRadius: 12, justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleLogout}
            style={{ backgroundColor: '#ef4444', paddingHorizontal: 16, height: 44, borderRadius: 12, justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
      <ActivityIndicator color="#ec4899" />
    </View>
  );
}
