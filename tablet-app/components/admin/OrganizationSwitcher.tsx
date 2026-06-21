import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

import { useAuthRole } from '@/src/contexts/AuthContext';
import { useOrganization } from '@/src/contexts/OrganizationContext';
import { usePermissions } from '@/src/contexts/PermissionContext';
import { useTranslation } from 'react-i18next';
import branchService, { type Organization, onOrganizationsChanged } from '@/src/services/branchService';

type Props = {
  variant?: 'compact' | 'title';
};

const truncateLabel = (value: string, maxChars: number): string => {
  const s = (value || '').trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}...`;
};

export function OrganizationSwitcher({ variant = 'compact' }: Props) {
  const { userType, getToken } = useAuthRole();
  const { isSuperAdmin: isSuperAdminFromPermissions } = usePermissions();
  const { selectedOrganizationId, selectedOrganizationName, setSelectedOrganizationId } = useOrganization();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [organizations, setOrganizations] = useState<Organization[]>(() =>
    branchService.getCachedOrganizations()
  );
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [showOfflineDialog, setShowOfflineDialog] = useState(false);

  const hasLoadedOnceRef = useRef(false);
  const hasPrefetchAttemptedRef = useRef(false);

  const isSuperAdmin = userType === 'SUPER_ADMIN' || isSuperAdminFromPermissions;

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

  useEffect(() => {
    if (organizations.length > 0) {
      hasLoadedOnceRef.current = true;
    }
  }, [organizations]);

  useEffect(() => {
    const prefetch = async () => {
      if (!isSuperAdmin) return;
      if (loading) return;
      if (hasPrefetchAttemptedRef.current) return;

      hasPrefetchAttemptedRef.current = true;

      const cached = branchService.getCachedOrganizations();
      if (cached.length > 0) {
        setOrganizations(cached);
        hasLoadedOnceRef.current = true;
      }

      try {
        setLoading(true);
        const token = await getToken();
        if (!token) return;
        let orgs: Organization[] = cached;
        if (cached.length > 0) {
          void branchService.prefetchOrganizations(token);
        } else {
          orgs = await branchService.getOrganizations(token);
        }
        const next = Array.isArray(orgs) ? orgs : [];
        if (next.length > 0) {
          setOrganizations(next);
          hasLoadedOnceRef.current = true;
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };

    prefetch();
  }, [getToken, isSuperAdmin, loading]);

  useEffect(() => {
    const load = async () => {
      if (!isSuperAdmin) return;
      if (!open) return;
      if (loading) return;

      const cached = branchService.getCachedOrganizations();
      if (cached.length > 0) {
        setOrganizations(cached);
        hasLoadedOnceRef.current = true;
      }

      if (hasLoadedOnceRef.current) {
        const token = await getToken();
        if (!token) return;
        void branchService.prefetchOrganizations(token);
        return;
      }

      try {
        setLoading(true);
        const token = await getToken();
        if (!token) return;
        const orgs = await branchService.getOrganizations(token);
        const next = Array.isArray(orgs) ? orgs : [];
        setOrganizations(next);
        hasLoadedOnceRef.current = true;
      } catch {
        setOrganizations([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [getToken, isSuperAdmin, open, loading]);

  useEffect(() => {
    const unsubscribe = onOrganizationsChanged(() => {
      if (!isSuperAdmin) return;
      void (async () => {
        try {
          const token = await getToken();
          if (!token) return;
          const orgs = await branchService.getOrganizations(token);
          setOrganizations(Array.isArray(orgs) ? orgs : []);
        } catch (error) {
          console.error('[OrganizationSwitcher] Failed to refresh organizations after change:', error);
        }
      })();
    });
    return unsubscribe;
  }, [getToken, isSuperAdmin]);

  const selectedOrgName = useMemo(() => {
    if (!selectedOrganizationId) return '';
    const fromList = organizations.find((o) => o.id === selectedOrganizationId)?.name || '';
    return fromList || selectedOrganizationName || '';
  }, [organizations, selectedOrganizationId, selectedOrganizationName]);

  useEffect(() => {
    const loadSelectedOrgName = async () => {
      if (!isSuperAdmin) return;
      if (!selectedOrganizationId) return;
      if (selectedOrganizationName && selectedOrganizationName.trim().length > 0) return;

      try {
        const token = await getToken();
        if (!token) return;
        const org = await branchService.getOrganizationById(selectedOrganizationId, token);
        const name = String((org as any)?.name || '').trim();
        if (!name) return;
        await setSelectedOrganizationId(selectedOrganizationId, name);
      } catch {
        // ignore
      }
    };

    loadSelectedOrgName();
  }, [getToken, isSuperAdmin, selectedOrganizationId, selectedOrganizationName, setSelectedOrganizationId]);

  useEffect(() => {
    if (!selectedOrganizationId) return;
    if (selectedOrganizationName && selectedOrganizationName.trim().length > 0) return;
    const fromList = organizations.find((o) => o.id === selectedOrganizationId);
    const name = (fromList?.name || '').trim();
    if (!name) return;
    setSelectedOrganizationId(selectedOrganizationId, name).catch(() => {
      // ignore
    });
  }, [organizations, selectedOrganizationId, selectedOrganizationName, setSelectedOrganizationId]);

  const selectedLabelRaw = selectedOrganizationId
    ? selectedOrgName || selectedOrganizationId
    : 'Select organization';

  const selectedLabel = String(selectedLabelRaw || '');

  const filteredOrganizations = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter((o) => {
      const name = String(o.name || '').toLowerCase();
      const id = String(o.id || '').toLowerCase();
      const organizationNumber = String(o.organizationNumber || '').toLowerCase();
      return name.includes(q) || id.includes(q) || organizationNumber.includes(q);
    });
  }, [organizations, search]);

  if (!isSuperAdmin) return null;

  return (
    <>
      <TouchableOpacity
        style={[styles.button, variant === 'title' && styles.buttonTitle]}
        onPress={() => {
          if (isOffline) {
            setShowOfflineDialog(true);
            return;
          }
          setOpen(true);
        }}
        accessibilityRole="button"
      >
        <View style={styles.buttonLeft}>
          <Text
            style={[styles.buttonText, variant === 'title' && styles.buttonTextTitle]}
            numberOfLines={1}
          >
            {selectedLabel}
          </Text>
        </View>
        <View style={styles.buttonRight}>
          {loading && open ? (
            <ActivityIndicator size="small" color={variant === 'title' ? '#ec4899' : '#ec4899'} />
          ) : (
            <MaterialCommunityIcons
              name="chevron-down"
              size={variant === 'title' ? 16 : 14}
              color={variant === 'title' ? '#374151' : '#6b7280'}
            />
          )}
        </View>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.bottomSheetContent, { paddingBottom: Math.max(12, insets.bottom + 12) }]}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>Select organization</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search"
                placeholderTextColor="#6b7280"
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {search.trim().length > 0 ? (
                <TouchableOpacity onPress={() => setSearch('')} style={styles.searchClear}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              ) : null}
            </View>

            <FlatList
              data={filteredOrganizations}
              keyExtractor={(org) => org.id}
              style={styles.bottomSheetBody}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: org }) => {
                const isSelected = org.id === selectedOrganizationId;
                return (
                  <TouchableOpacity
                    style={[styles.option, isSelected && styles.optionActive]}
                    onPress={() => {
                      setOpen(false);
                      setSelectedOrganizationId(org.id, org.name || null).catch(() => {
                        // ignore
                      });
                    }}
                  >
                    <Text style={[styles.optionText, isSelected && styles.optionTextActive]} numberOfLines={1}>
                      {org.name || org.id}
                    </Text>
                    {isSelected ? (
                      <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                loading ? (
                  <View style={styles.emptyWrap}>
                    <ActivityIndicator size="small" color="#ec4899" />
                  </View>
                ) : (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>No results</Text>
                  </View>
                )
              }
            />
          </View>
        </View>
      </Modal>

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
                {t('admin.pos.organizationSwitchOfflineTitle', { defaultValue: 'Organization Switch Not Available Offline' })}
              </Text>
              <Text style={styles.offlineDialogMessage}>
                {t('admin.pos.organizationSwitchOfflineMessage', { defaultValue: 'Switching organizations requires an internet connection. Please connect to the internet to change organizations.' })}
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
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.25)',
    backgroundColor: 'rgba(236, 72, 153, 0.08)',
    minWidth: 140,
    maxWidth: '80%',
    flexShrink: 0,
    gap: 8,
  },
  buttonTitle: {
    height: 38,
    borderRadius: 14,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 14,
    minWidth: 180,
    maxWidth: 320,
  },
  buttonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  buttonText: {
    color: '#ec4899',
    fontSize: 12,
    flex: 1,
    minWidth: 0,
  },
  buttonTextTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },

  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  bottomSheetContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  bottomSheetBody: {
    padding: 8,
    maxHeight: 400,
  },
  modalHeader: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  searchWrap: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 10,
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: '#111827',
    fontSize: 14,
  },
  searchClear: {
    padding: 2,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionActive: {
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.35)',
  },
  optionText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    paddingRight: 10,
  },
  optionTextActive: {
    color: '#ec4899',
  },
  emptyWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6b7280',
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
