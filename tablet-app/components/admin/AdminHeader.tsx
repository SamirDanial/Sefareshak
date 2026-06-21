import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View, Modal, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';

import { OrganizationSwitcher } from '@/components/admin/OrganizationSwitcher';
import NotificationBell from '@/components/admin/NotificationBell';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useAuthRole } from '@/src/contexts/AuthContext';
import { useOrganization } from '@/src/contexts/OrganizationContext';
import { usePermissions } from '@/src/contexts/PermissionContext';
import { usePosDevice, callGlobalRefreshDeviceList } from '@/src/contexts/PosDeviceContext';
import { posDeviceService } from '@/src/services/posDeviceService';

const HEADER_HEIGHT = 56;

interface AdminHeaderProps {
  title: string;
  onMenuPress: () => void;
  shouldShowOrgSwitcherInTitle: boolean;
  shouldHideAdminHeader: boolean;
  hideMenuButton?: boolean;
}

export default function AdminHeader({ 
  title, 
  onMenuPress, 
  shouldShowOrgSwitcherInTitle, 
  shouldHideAdminHeader,
  hideMenuButton = false,
}: AdminHeaderProps) {
  const { t } = useTranslation();
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { userType } = useAuthRole();
  const { rbacUser, isSuperAdmin, isOrgAdmin, isLoading: permissionsLoading } = usePermissions();
  const { selectedDevice, forgetDevice } = usePosDevice();
  const { getToken } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  const [showForgetDeviceDialog, setShowForgetDeviceDialog] = useState(false);
  const [isForgetting, setIsForgetting] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected && state.isInternetReachable !== false);
    });
    // Check initial state
    void NetInfo.fetch().then((state) => {
      setIsConnected(state.isConnected && state.isInternetReachable !== false);
    });
    return () => unsubscribe();
  }, []);

  const lastCanViewNotificationsRef = useRef(false);
  const canViewNotifications = useMemo(() => {
    if (permissionsLoading) return lastCanViewNotificationsRef.current;
    const next = Boolean((rbacUser as any) && (rbacUser as any).permissions);
    lastCanViewNotificationsRef.current = next;
    return next;
  }, [permissionsLoading, rbacUser]);
  
  const viewerOrgRole = (rbacUser as any)?.orgRole as string | null | undefined;
  const isOrgOwner = viewerOrgRole === "ORG_OWNER";
  const canForgetDevice = isSuperAdmin || isOrgAdmin || isOrgOwner;
  const showAsSuperAdmin = userType === 'SUPER_ADMIN' || isSuperAdmin;

  const handleForgetDevice = () => {
    setShowForgetDeviceDialog(true);
  };

  const confirmForgetDevice = async () => {
    if (!selectedDevice) return;
    
    setIsForgetting(true);
    try {
      // First deactivate the device in backend
      const orgId = (selectedOrganizationId || '').trim();
      if (orgId) {
        const token = await getToken();
        if (token) {
          await posDeviceService.updateForOrganization(
            orgId,
            selectedDevice.id,
            { isActive: false },
            token
          );
        }
      }
      
      // Then forget the device locally
      await forgetDevice();
      
      // Refresh the device list if we're on the POS Devices page
      await callGlobalRefreshDeviceList();
      
      setShowForgetDeviceDialog(false);
    } catch (error) {
      console.error('Failed to deactivate device:', error);
      // Still forget the device even if deactivation fails
      await forgetDevice();
      
      // Refresh the device list if we're on the POS Devices page
      await callGlobalRefreshDeviceList();
      
      setShowForgetDeviceDialog(false);
    } finally {
      setIsForgetting(false);
    }
  };

  if (shouldHideAdminHeader) {
    return null;
  }

  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {!hideMenuButton && (
            <TouchableOpacity onPress={onMenuPress} style={styles.menuButton}>
              <MaterialCommunityIcons name="menu" size={20} color="#374151" />
            </TouchableOpacity>
          )}

          <Text style={styles.headerTitleLeft} numberOfLines={1}>
            {title}
          </Text>
        </View>

        <View style={styles.headerCenter}>
          {selectedDevice && !showAsSuperAdmin ? (
            <View style={styles.deviceInfoContainer}>
              <View style={styles.deviceInfo}>
                <MaterialCommunityIcons name="tablet" size={16} color="#9CA3AF" />
                <Text style={styles.deviceName}>{selectedDevice.name}</Text>
              </View>
              {canForgetDevice && (
                <TouchableOpacity 
                  onPress={handleForgetDevice} 
                  style={styles.forgetDeviceButton}
                >
                  <MaterialCommunityIcons name="logout-variant" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          ) : shouldShowOrgSwitcherInTitle ? (
            <OrganizationSwitcher variant="title" />
          ) : null}
        </View>

        <View style={styles.headerRight}>
          {showAsSuperAdmin && !shouldShowOrgSwitcherInTitle ? (
            <OrganizationSwitcher variant="compact" />
          ) : null}
          {selectedDevice && showAsSuperAdmin ? (
            <View style={styles.deviceInfoContainer}>
              <View style={styles.deviceInfo}>
                <MaterialCommunityIcons name="tablet" size={16} color="#9CA3AF" />
                <Text style={styles.deviceName}>{selectedDevice.name}</Text>
              </View>
              {canForgetDevice && (
                <TouchableOpacity 
                  onPress={handleForgetDevice} 
                  style={styles.forgetDeviceButton}
                >
                  <MaterialCommunityIcons name="logout-variant" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          ) : null}
          
          {/* Connection Status Indicator */}
          <View style={[
            styles.connectionIndicator,
            { backgroundColor: isConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)' }
          ]}>
            <View style={[
              styles.connectionDot,
              { backgroundColor: isConnected ? '#22c55e' : '#ef4444' }
            ]} />
            <Text style={[
              styles.connectionText,
              { color: isConnected ? '#22c55e' : '#ef4444' }
            ]}>
              {isConnected ? 'Online' : 'Offline'}
            </Text>
          </View>

          <LanguageSwitcher />
          {canViewNotifications ? <NotificationBell /> : null}
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {user?.firstName?.charAt(0) ||
                  user?.emailAddresses?.[0]?.emailAddress?.charAt(0)?.toUpperCase() ||
                  'A'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Forget Device Dialog */}
      <Modal visible={showForgetDeviceDialog} transparent animationType="fade" onRequestClose={() => setShowForgetDeviceDialog(false)}>
        <Pressable style={styles.dialogOverlay} onPress={() => setShowForgetDeviceDialog(false)}>
          <Pressable style={styles.dialogContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.dialogIconContainer}>
              <MaterialCommunityIcons name="logout-variant" size={48} color="#ef4444" />
            </View>
            <Text style={styles.dialogTitle}>{t("admin.forgetDevice.confirmTitle")}</Text>
            <Text style={styles.dialogDescription}>
              {t("admin.forgetDevice.confirmMessage", { 
                deviceName: selectedDevice?.name || t("admin.posDevices.unknownDevice")
              })}
            </Text>
            <View style={styles.dialogButtons}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={() => setShowForgetDeviceDialog(false)}
                disabled={isForgetting}
              >
                <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.forgetButton} 
                onPress={confirmForgetDevice}
                disabled={isForgetting}
              >
                {isForgetting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.forgetButtonText}>{t("admin.forgetDevice.confirm")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    height: HEADER_HEIGHT,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    padding: 4,
  },
  headerTitleLeft: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deviceName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '500',
  },
  forgetDeviceButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  headerRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
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
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  // Dialog styles following tablet app standards
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dialogIconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  dialogDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  forgetButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  forgetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  connectionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  connectionText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
