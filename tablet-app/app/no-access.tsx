import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth, useClerk } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import ApiService from '@/src/services/apiService';
import { useAuthRole } from '@/src/contexts/AuthContext';
import { usePermissions } from '@/src/contexts/PermissionContext';

export default function NoAccessScreen() {
  const { signOut } = useClerk();
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
    if (!isSignedIn) return;
    if (authRoleLoading || permissionsLoading) return;
    if (entitled) {
      router.replace('/(admin)' as any);
    }
  }, [authRoleLoading, entitled, isLoaded, isSignedIn, permissionsLoading, router]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.card}>
        <Text style={styles.title}>Access denied</Text>
        <Text style={styles.subtitle}>
          Your account does not have permission to access the admin panel.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            try {
              // Prevent new API calls during logout
              ApiService.setLoggingOut(true);
              await signOut();
            } finally {
              router.replace('/(auth)/sign-in' as any);
            }
          }}
        >
          <Text style={styles.buttonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 18,
    lineHeight: 20,
  },
  button: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
