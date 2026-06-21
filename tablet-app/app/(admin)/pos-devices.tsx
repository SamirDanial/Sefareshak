import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { usePosDevice, setGlobalRefreshDeviceList } from "@/src/contexts/PosDeviceContext";
import branchService, { type Branch } from "@/src/services/branchService";
import {
  posDeviceService,
  type CreatePosDeviceInput,
  type PosDevice,
} from "@/src/services/posDeviceService";

const STORAGE_SELECTED_POS_DEVICE_ID = "nf:selectedPosDeviceId";

const suggestDeviceCode = () => {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TAB-${rand}`;
};

export default function PosDevicesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  const { rbacUser, isSuperAdmin } = usePermissions();
  const { setSelectedDeviceId } = usePosDevice();

  const viewerOrgRole = (rbacUser as any)?.orgRole as string | null | undefined;
  const isOrgOwnerOrAdmin = viewerOrgRole === "ORG_OWNER" || viewerOrgRole === "ORG_ADMIN";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [successWarnings, setSuccessWarnings] = useState<string[]>([]);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [filterBranchId, setFilterBranchId] = useState<string>("");
  const [filterBranchPickerOpen, setFilterBranchPickerOpen] = useState(false);

  const [highlightedDeviceId, setHighlightedDeviceId] = useState<string | null>(null);
  const [persistedAssignedDeviceId, setPersistedAssignedDeviceId] = useState<string | null>(null);
  const [provisioningDeviceIds, setProvisioningDeviceIds] = useState<Set<string>>(new Set());
  const [deactivatingDeviceIds, setDeactivatingDeviceIds] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<PosDevice | null>(null);
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [deviceToProvision, setDeviceToProvision] = useState<PosDevice | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deviceToDeactivate, setDeviceToDeactivate] = useState<PosDevice | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);

  const [form, setForm] = useState<CreatePosDeviceInput>({
    branchId: "",
    name: "Tablet",
    deviceCode: suggestDeviceCode(),
    isActive: true,
  });

  const selectedBranch = useMemo(() => {
    return branches.find((b) => String(b.id) === String(form.branchId)) || null;
  }, [branches, form.branchId]);

  const selectedFilterBranch = useMemo(() => {
    return branches.find((b) => String(b.id) === String(filterBranchId)) || null;
  }, [branches, filterBranchId]);

  const getBranchLabelForDevice = useCallback(
    (device: PosDevice): string => {
      const id = String(device.branchId || "").trim();
      if (!id) return "";
      const branch = branches.find((b) => String(b.id) === id);
      return branch?.name || id;
    },
    [branches]
  );

  const loadPersistedAssignedDeviceId = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_SELECTED_POS_DEVICE_ID);
      const val = (raw || "").trim();
      setPersistedAssignedDeviceId(val.length > 0 ? val : null);
    } catch {
      setPersistedAssignedDeviceId(null);
    }
  }, []);

  
  const reload = useCallback(async () => {
    // Prevent reload during deletion to avoid race conditions
    if (isDeleting) {
      return;
    }
    
    const orgId = (selectedOrganizationId || "").trim();
    if (!orgId) {
      setDevices([]);
      setBranches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      // Load branches first so we can decide default branch filter for org admins/owners
      const brs = await branchService.getBranches(token || undefined, { organizationId: orgId });
      const normalizedBranches = Array.isArray(brs) ? brs : [];
      setBranches(normalizedBranches);

      let effectiveBranchId: string | undefined = undefined;
      if (isOrgOwnerOrAdmin) {
        const current = String(filterBranchId || "").trim();
        const isValid = current && normalizedBranches.some((b) => String(b.id) === current);
        const next = isValid ? current : (normalizedBranches[0]?.id ? String(normalizedBranches[0].id) : "");
        if (next !== current) {
          setFilterBranchId(next);
        }
        effectiveBranchId = next || undefined;
      }

      const devs = await posDeviceService.listForOrganization(orgId, token || undefined, effectiveBranchId);
      setDevices(Array.isArray(devs) ? devs : []);
    } catch (e: any) {
      setErrorMessage(e?.message || t("common.error"));
      setShowErrorDialog(true);
    } finally {
      setLoading(false);
    }
  }, [getToken, selectedOrganizationId, t, isDeleting, isOrgOwnerOrAdmin, filterBranchId]);

  const reloadDevicesOnly = useCallback(async () => {
    const orgId = (selectedOrganizationId || "").trim();
    if (!orgId) return;
    if (!isOrgOwnerOrAdmin) return;

    const branchId = String(filterBranchId || "").trim();
    if (!branchId) {
      setDevices([]);
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const devs = await posDeviceService.listForOrganization(orgId, token || undefined, branchId);
      setDevices(Array.isArray(devs) ? devs : []);
    } catch (e: any) {
      setErrorMessage(e?.message || t("common.error"));
      setShowErrorDialog(true);
    } finally {
      setLoading(false);
    }
  }, [filterBranchId, getToken, isOrgOwnerOrAdmin, selectedOrganizationId, t]);

  useEffect(() => {
    void loadPersistedAssignedDeviceId();
  }, [loadPersistedAssignedDeviceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void reloadDevicesOnly();
  }, [reloadDevicesOnly]);

  // Re-sync persisted assignment when devices list changes (after create/delete/refresh)
  useEffect(() => {
    void loadPersistedAssignedDeviceId();
  }, [devices, loadPersistedAssignedDeviceId]);

  // Set global refresh function when component mounts
  useEffect(() => {
    setGlobalRefreshDeviceList(async () => {
      await reload();
    });

    // Cleanup function to unset when component unmounts
    return () => {
      setGlobalRefreshDeviceList(() => Promise.resolve());
    };
  }, [reload]);

  const fetchOrgSettings = useCallback(async () => {
    const orgId = (selectedOrganizationId || "").trim();
    if (!orgId) return null;
    const token = await getToken();
    if (!token) return null;
    try {
      return await branchService.getOrganizationSettings(orgId, token);
    } catch (error: any) {
      console.error("Failed to fetch organization settings:", error);
      return null;
    }
  }, [getToken, selectedOrganizationId]);

  const handleCreate = useCallback(async () => {
    const orgId = (selectedOrganizationId || "").trim();
    if (!orgId) {
      setErrorMessage(t("admin.posDevices.create.errors.orgRequired"));
      setShowErrorDialog(true);
      return;
    }

    const branchId = String(form.branchId || "").trim();
    const name = String(form.name || "").trim();
    const deviceCode = String(form.deviceCode || "").trim();

    if (!branchId || !name || !deviceCode) {
      setErrorMessage(t("admin.posDevices.create.errors.fieldsRequired"));
      setShowErrorDialog(true);
      return;
    }

    // If trying to create an active device, validate org Fiskaly readiness
    if (form.isActive !== false) {
      const settings = await fetchOrgSettings();
      const enabled = Boolean(settings?.fiskalyEnabled);
      const environment = settings?.fiskalyEnvironment || "NONE";
      const status = settings?.fiskalyProvisioningStatus || "NONE";
      
      if (
        !enabled ||
        environment !== "LIVE" ||
        status !== "READY"
      ) {
        const issues = [];
        if (!enabled) issues.push("Fiskaly is not enabled");
        if (environment !== "LIVE") issues.push(`Environment is "${environment}" but must be "LIVE"`);
        if (status !== "READY") issues.push(`Status is "${status}" but must be "READY"`);
        
        setErrorMessage(`Device cannot be active because:\n${issues.join("\n")}\n\nPlease configure Fiskaly in Organization Settings first.`);
        setShowErrorDialog(true);
        return;
      }
    }

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const created = await posDeviceService.createForOrganization(
        orgId,
        { branchId, name, deviceCode, isActive: form.isActive !== false },
        token || undefined
      );

      setDevices((prev) => [created, ...prev]);
      await setSelectedDeviceId(created.id);
      setCreateOpen(false);
      setForm({
        branchId,
        name: "Tablet",
        deviceCode: suggestDeviceCode(),
        isActive: true,
      });
    } catch (e: any) {
      const msg = e?.message || t("common.error");
      setErrorMessage(msg);
      setShowErrorDialog(true);
    } finally {
      setSaving(false);
    }
  }, [form, getToken, setSelectedDeviceId, selectedOrganizationId, t, fetchOrgSettings]);

  const handleSelect = useCallback(
    async (id: string) => {
      await setSelectedDeviceId(id);
    },
    [setSelectedDeviceId]
  );

  const handleDelete = useCallback(
    (device: PosDevice) => {
      setDeviceToDelete(device);
      setShowDeleteModal(true);
    },
    []
  );

  const confirmDelete = useCallback(async () => {
    if (!deviceToDelete || isDeleting) return;
    
    const orgId = (selectedOrganizationId || "").trim();
    if (!orgId) return;

    setIsDeleting(true);
    
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const response = await posDeviceService.deleteForOrganization(orgId, deviceToDelete.id, token || undefined);
      
      // Handle the comprehensive deletion response
      if (response.success) {
        // Remove device from list since backend filters out deleted devices
        setDevices((prev) => prev.filter((d) => d.id !== deviceToDelete.id));
        if (persistedAssignedDeviceId === deviceToDelete.id) {
          await setSelectedDeviceId(null);
        }

        setShowDeleteModal(false);
        setDeviceToDelete(null);

        // Show success message with warnings if any
        let message = response.data.message;
        const warnings = response.warnings || [];
        
        setSuccessMessage(message);
        setSuccessWarnings(warnings);
        setShowSuccessDialog(true);
      } else {
        throw new Error(response.error || "Deletion failed");
      }
    } catch (e: any) {
      setErrorMessage(e?.message || t("common.error"));
      setShowErrorDialog(true);
    } finally {
      setIsDeleting(false);
    }
  }, [deviceToDelete, getToken, selectedOrganizationId, persistedAssignedDeviceId, setSelectedDeviceId, t, isDeleting]);

  const handleProvisionFiskalyClient = useCallback(
    (device: PosDevice) => {
      setDeviceToProvision(device);
      setShowProvisionModal(true);
    },
    []
  );

  const confirmProvision = useCallback(async () => {
    if (!deviceToProvision) return;
    
    const orgId = (selectedOrganizationId || "").trim();
    if (!orgId) return;

    setIsProvisioning(true);
    setProvisioningDeviceIds((prev) => new Set(prev).add(deviceToProvision.id));
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const updated = await posDeviceService.provisionFiskalyClient(orgId, deviceToProvision.id, token);
      setDevices((prev) => prev.map((d) => (d.id === deviceToProvision.id ? updated : d)));
      
      // Automatically select the provisioned device so it appears in navbar
      await setSelectedDeviceId(deviceToProvision.id);
      
      setShowProvisionModal(false);
      setDeviceToProvision(null);
    } catch (e: any) {
      setErrorMessage(e?.message || t("common.error"));
      setShowErrorDialog(true);
    } finally {
      setIsProvisioning(false);
      setProvisioningDeviceIds((prev) => {
        const next = new Set(prev);
        next.delete(deviceToProvision?.id);
        return next;
      });
    }
  }, [deviceToProvision, getToken, selectedOrganizationId, t]);

  const handleToggleActive = useCallback((device: PosDevice) => {
    // If deactivating a provisioned device, show confirmation
    if (device.isActive && device.fiskalyClientId) {
      setDeviceToDeactivate(device);
      setShowDeactivateModal(true);
    } else {
      // Otherwise, toggle immediately
      confirmToggleActive(device);
    }
  }, []);

  const confirmToggleActive = useCallback(async (device: PosDevice, fromModal = false) => {
    const orgId = (selectedOrganizationId || "").trim();
    if (!orgId) return;

    // Track deactivating state
    if (fromModal) {
      setIsDeactivating(true);
    }
    setDeactivatingDeviceIds((prev) => new Set(prev).add(device.id));
    
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const updated = await posDeviceService.updateForOrganization(
        orgId,
        device.id,
        { isActive: !device.isActive },
        token
      );
      setDevices((prev) => prev.map((d) => (d.id === device.id ? updated : d)));
      setShowDeactivateModal(false);
      setDeviceToDeactivate(null);
    } catch (e: any) {
      setErrorMessage(e?.message || t("common.error"));
      setShowErrorDialog(true);
    } finally {
      // Remove from deactivating state
      if (fromModal) {
        setIsDeactivating(false);
      }
      setDeactivatingDeviceIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(device.id);
        return newSet;
      });
    }
  }, [getToken, selectedOrganizationId, t]);

  const renderItem = useCallback(
    ({ item }: { item: PosDevice }) => {
      // Defensive programming - skip if item is invalid
      if (!item || !item.id) {
        return null;
      }
      
      const isHighlighted = highlightedDeviceId === item.id;
      const isCurrent = persistedAssignedDeviceId === item.id;
      const isProvisioning = provisioningDeviceIds.has(item.id);
      const isDeactivating = deactivatingDeviceIds.has(item.id);
      const status = item.fiskalyClientProvisioningStatus;
      const isReady = status === "READY";
      const isFailed = status === "FAILED";
      const isInProgress = status === "IN_PROGRESS";

      const branchLabel = getBranchLabelForDevice(item);

      return (
        <Pressable
          onPress={() => {
            setHighlightedDeviceId(item.id);
          }}
          style={[styles.deviceRow, isHighlighted ? styles.deviceRowSelected : null]}
        >
          {/* Loading overlay */}
          {(isProvisioning || isDeactivating) && (
            <View style={styles.deviceLoadingOverlay} />
          )}
          <View style={styles.deviceRowLeft}>
            <View style={styles.deviceNameRow}>
              <Text style={styles.deviceName}>{item.name || t("admin.posDevices.unknownDevice")}</Text>
              {isCurrent && (
                <View style={styles.currentDeviceBadge}>
                  <MaterialCommunityIcons name="tablet" size={10} color="#fff" />
                  <Text style={styles.currentDeviceBadgeText}>{t("admin.posDevices.currentDevice")}</Text>
                </View>
              )}
            </View>
            <Text style={styles.deviceMeta}>{item.deviceCode || 'N/A'}</Text>
            {branchLabel ? (
              <Text style={styles.deviceMeta}>{t("admin.posDevices.branch")}: {branchLabel}</Text>
            ) : null}
            {item.fiskalyClientId ? (
              <Text style={styles.deviceMetaFiskaly}>{t("admin.posDevices.client")}: {item.fiskalyClientId}</Text>
            ) : null}
            {isFailed && item.fiskalyClientProvisioningLastErrorMessage ? (
              <Text style={styles.deviceError}>{item.fiskalyClientProvisioningLastErrorMessage}</Text>
            ) : null}
          </View>

          <View style={styles.deviceRowRight}>
            {isDeactivating ? (
              <View style={[styles.switchContainer, styles.switchLoading]}>
                <ActivityIndicator size="small" color="#6b7280" />
              </View>
            ) : (
              <TouchableOpacity
                style={styles.switchContainer}
                onPress={() => handleToggleActive(item)}
                disabled={isProvisioning}
              >
                <View
                  style={[
                    styles.switch,
                    item.isActive ? styles.switchActive : styles.switchInactive,
                    isProvisioning && styles.switchDisabled,
                  ]}
                >
                  <View
                    style={[
                      styles.switchThumb,
                      item.isActive ? styles.switchThumbActive : styles.switchThumbInactive,
                    ]}
                  />
                </View>
              </TouchableOpacity>
            )}

            {status ? (
              <View
                style={[
                  styles.statusPill,
                  isReady
                    ? styles.statusPillReady
                    : isFailed
                    ? styles.statusPillFailed
                    : styles.statusPillInProgress,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    isReady
                      ? styles.statusPillTextReady
                      : isFailed
                      ? styles.statusPillTextFailed
                      : styles.statusPillTextInProgress,
                  ]}
                >
                  {isReady ? t("admin.posDevices.status.ready") : isFailed ? t("admin.posDevices.status.failed") : isInProgress ? t("admin.posDevices.status.inProgress") : status}
                </Text>
              </View>
            ) : null}

            
            {item.isActive && (!status || isFailed) && !isProvisioning ? (
              <TouchableOpacity
                onPress={() => handleProvisionFiskalyClient(item)}
                style={[styles.iconButton, styles.provisionButton]}
              >
                <MaterialCommunityIcons name={isFailed ? "refresh" : "play"} size={18} color="#ec4899" />
              </TouchableOpacity>
            ) : null}

            {isProvisioning ? (
              <View style={[styles.iconButton, styles.provisioningButton]}>
                <ActivityIndicator size="small" color="#ec4899" />
              </View>
            ) : null}

                        
            {isSuperAdmin ? (
              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconButton}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [handleDelete, handleSelect, highlightedDeviceId, persistedAssignedDeviceId, provisioningDeviceIds, deactivatingDeviceIds, handleProvisionFiskalyClient, isSuperAdmin, handleToggleActive, getBranchLabelForDevice, t]
  );

  const topPad = insets.top + 12;

  return (
    <>
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("admin.posDevices.title")}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={reload} style={styles.headerButton}>
              <MaterialCommunityIcons name="refresh" size={18} color="#111827" />
              <Text style={styles.headerButtonText}>{t("admin.posDevices.refresh")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isOrgOwnerOrAdmin ? (
          <View style={styles.helperBox}>
            <Text style={styles.helperText}>
              {t("admin.posDevices.helperText")}
            </Text>
          </View>
        ) : null}

        {isOrgOwnerOrAdmin ? (
          <TouchableOpacity
            onPress={() => setFilterBranchPickerOpen(true)}
            style={styles.branchFilter}
            disabled={loading || branches.length === 0}
          >
            <Text style={styles.branchFilterLabel}>
              {t("admin.posDevices.branch")}
            </Text>
            <View style={styles.branchFilterRow}>
              <Text style={styles.branchFilterValue} numberOfLines={1}>
                {selectedFilterBranch?.name || (filterBranchId ? filterBranchId : t("admin.posDevices.create.selectBranch"))}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color="#6b7280" />
            </View>
          </TouchableOpacity>
        ) : null}

        {!selectedOrganizationId ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>{t("admin.posDevices.selectOrgFirst")}</Text>
          </View>
        ) : loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#ec4899" />
          </View>
        ) : (
          <FlatList
            data={devices || []}
            keyExtractor={(d) => d?.id || ''}
            renderItem={renderItem}
            contentContainerStyle={!devices || devices.length === 0 ? styles.emptyList : styles.listContainer}
            ListEmptyComponent={
              <Text style={styles.emptyText}>{t("admin.posDevices.noDevices")}</Text>
            }
          />
        )}

        {isSuperAdmin ? (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setCreateOpen(true)}
          >
            <MaterialCommunityIcons name="plus" size={24} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      <Modal visible={createOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("admin.posDevices.create.title")}</Text>

            <TouchableOpacity onPress={() => setBranchPickerOpen(true)} style={styles.branchPicker}>
              <Text style={styles.branchPickerLabel}>{t("admin.posDevices.create.branch")}</Text>
              <View style={styles.branchPickerRow}>
                <Text style={styles.branchPickerValue} numberOfLines={1}>
                  {selectedBranch?.name || (form.branchId ? form.branchId : t("admin.posDevices.create.selectBranch"))}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color="#6b7280" />
              </View>
            </TouchableOpacity>

            <Text style={styles.inputLabel}>{t("admin.posDevices.create.name")}</Text>
            <TextInput
              value={form.name}
              onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
              style={styles.input}
              placeholder="Tablet"
            />

            <Text style={styles.inputLabel}>{t("admin.posDevices.create.deviceCode")}</Text>
            <TextInput
              value={form.deviceCode}
              onChangeText={(v) => setForm((p) => ({ ...p, deviceCode: v }))}
              style={styles.input}
              autoCapitalize="characters"
              placeholder="TAB-001"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setForm((p) => ({ ...p, deviceCode: suggestDeviceCode() }));
                }}
                style={styles.secondaryButton}
                disabled={saving}
              >
                <Text style={styles.secondaryButtonText}>{t("admin.posDevices.create.suggestCode")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setCreateOpen(false)}
                style={styles.secondaryButton}
                disabled={saving}
              >
                <Text style={styles.secondaryButtonText}>{t("admin.posDevices.create.cancel")}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleCreate} style={styles.primaryButton} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t("admin.posDevices.create.create")}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={filterBranchPickerOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setFilterBranchPickerOpen(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setFilterBranchPickerOpen(false)}>
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>{t("admin.posDevices.create.selectBranch")}</Text>
              <TouchableOpacity onPress={() => setFilterBranchPickerOpen(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {branches.map((branch) => (
                <TouchableOpacity
                  key={branch.id}
                  style={[
                    styles.bottomSheetOption,
                    filterBranchId === branch.id && styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    setFilterBranchId(branch.id);
                    setFilterBranchPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      filterBranchId === branch.id && styles.bottomSheetOptionTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {branch.name || branch.id}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={branchPickerOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setBranchPickerOpen(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setBranchPickerOpen(false)}>
          <Pressable
            style={[styles.bottomSheetContent, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>{t("admin.posDevices.create.selectBranch")}</Text>
              <TouchableOpacity onPress={() => setBranchPickerOpen(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {branches.map((branch) => (
                <TouchableOpacity
                  key={branch.id}
                  style={[
                    styles.bottomSheetOption,
                    form.branchId === branch.id && styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    setForm((p) => ({ ...p, branchId: branch.id }));
                    setBranchPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      form.branchId === branch.id && styles.bottomSheetOptionTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {branch.name || branch.id}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <Pressable style={styles.deleteModalOverlay} onPress={() => setShowDeleteModal(false)}>
          <Pressable style={styles.deleteModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.deleteModalTitle}>{t("admin.posDevices.delete.title")}</Text>
            <Text style={styles.deleteModalDescription}>
              {t("admin.posDevices.delete.description", { 
                name: deviceToDelete?.name,
                deviceCode: deviceToDelete?.deviceCode
              })}
            </Text>
            <View style={styles.deletionInfoBox}>
              <Text style={styles.deletionInfoTitle}>{t("admin.posDevices.delete.whatHappens")}</Text>
              <Text style={styles.deletionInfoItem}>{
                deviceToDelete?.fiskalyClientId 
                  ? t("admin.posDevices.delete.fiskalyClientDeprovision")
                  : t("admin.posDevices.delete.deviceRemoved")
              }</Text>
              <Text style={styles.deletionInfoItem}>{
                deviceToDelete?.fiskalyClientId 
                  ? t("admin.posDevices.delete.fiskalyClientArchive")
                  : t("admin.posDevices.delete.allDataDeleted")
              }</Text>
              <Text style={styles.deletionInfoItem}>{t("admin.posDevices.delete.cannotUndo")}</Text>
            </View>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowDeleteModal(false)}>
                <Text style={styles.cancelButtonText}>{t("admin.posDevices.delete.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]} 
                onPress={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.deleteButtonText}>{t("admin.posDevices.delete.delete")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showProvisionModal} transparent animationType="fade" onRequestClose={() => setShowProvisionModal(false)}>
        <Pressable style={styles.deleteModalOverlay} onPress={() => setShowProvisionModal(false)}>
          <Pressable style={styles.deleteModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.deleteModalTitle}>{t("admin.posDevices.provision.title")}</Text>
            <Text style={styles.deleteModalDescription}>
              {t("admin.posDevices.provision.description", { 
                name: deviceToProvision?.name,
                deviceCode: deviceToProvision?.deviceCode
              })}
            </Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowProvisionModal(false)}>
                <Text style={styles.cancelButtonText}>{t("admin.posDevices.provision.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.provisionConfirmButton} onPress={confirmProvision} disabled={isProvisioning}>
                {isProvisioning ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.provisionConfirmButtonText}>{t("admin.posDevices.provision.provision")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDeactivateModal} transparent animationType="fade" onRequestClose={() => setShowDeactivateModal(false)}>
        <Pressable style={styles.deleteModalOverlay} onPress={() => setShowDeactivateModal(false)}>
          <Pressable style={styles.deleteModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.deleteModalTitle}>{t("admin.posDevices.deactivate.title")}</Text>
            <Text style={styles.deleteModalDescription}>
              {t("admin.posDevices.deactivate.description", { 
                name: deviceToDeactivate?.name,
                deviceCode: deviceToDeactivate?.deviceCode
              })}
            </Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowDeactivateModal(false)}>
                <Text style={styles.cancelButtonText}>{t("admin.posDevices.deactivate.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => deviceToDeactivate && confirmToggleActive(deviceToDeactivate, true)} disabled={isDeactivating}>
                {isDeactivating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.deleteButtonText}>{t("admin.posDevices.deactivate.deactivate")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Error Dialog */}
      <Modal visible={showErrorDialog} transparent animationType="fade" onRequestClose={() => setShowErrorDialog(false)}>
        <Pressable style={styles.deleteModalOverlay} onPress={() => setShowErrorDialog(false)}>
          <Pressable style={styles.deleteModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.errorIconContainer}>
              <MaterialCommunityIcons name="alert-circle" size={48} color="#ef4444" />
            </View>
            <Text style={styles.deleteModalTitle}>{t("admin.posDevices.error.title")}</Text>
            <Text style={styles.deleteModalDescription}>
              {errorMessage}
            </Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity style={styles.errorButton} onPress={() => setShowErrorDialog(false)}>
                <Text style={styles.errorButtonText}>{t("common.ok")}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Success Dialog */}
      <Modal visible={showSuccessDialog} transparent animationType="fade" onRequestClose={() => setShowSuccessDialog(false)}>
        <Pressable style={styles.deleteModalOverlay} onPress={() => setShowSuccessDialog(false)}>
          <Pressable style={styles.deleteModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.successIconContainer}>
              <MaterialCommunityIcons name="check-circle" size={48} color="#10b981" />
            </View>
            <Text style={styles.deleteModalTitle}>{t("admin.posDevices.success.title")}</Text>
            <Text style={styles.deleteModalDescription}>
              {successMessage}
            </Text>
            
            {successWarnings.length > 0 && (
              <View style={styles.warningsContainer}>
                <Text style={styles.warningsTitle}>{t("admin.posDevices.success.warnings")}</Text>
                {successWarnings.map((warning, index) => (
                  <Text key={index} style={styles.warningItem}>{"\u2022 " + warning}</Text>
                ))}
              </View>
            )}
            
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity style={styles.successButton} onPress={() => setShowSuccessDialog(false)}>
                <Text style={styles.successButtonText}>{t("admin.posDevices.success.ok")}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f9fafb",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  headerButtonText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingWrap: {
    paddingVertical: 30,
    alignItems: "center",
  },
  emptyWrap: {
    paddingVertical: 30,
    alignItems: "center",
  },
  helperBox: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  helperText: {
    color: "#6b7280",
    fontSize: 12,
    textAlign: "center",
  },
  branchFilter: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  branchFilterLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  branchFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  branchFilterValue: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    marginRight: 10,
  },
  emptyList: {
    paddingVertical: 30,
  },
  listContainer: {
    paddingBottom: 80,
  },
  emptyText: {
    color: "#4b5563",
    textAlign: "center",
  },
  deviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  deviceRowSelected: {
    borderColor: "#ec4899",
    borderWidth: 2,
  },
  deviceRowLeft: {
    flex: 1,
  },
  deviceRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deviceName: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 14,
  },
  deviceMeta: {
    color: "#6b7280",
    marginTop: 2,
    fontSize: 12,
  },
  deviceMetaFiskaly: {
    color: "#10b981",
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
  },
  deviceError: {
    color: "#ef4444",
    marginTop: 2,
    fontSize: 11,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    minWidth: 70,
    alignItems: "center",
  },
  statusPillReady: {
    backgroundColor: "#dcfce7",
  },
  statusPillFailed: {
    backgroundColor: "#fecaca",
  },
  statusPillInProgress: {
    backgroundColor: "#dbeafe",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusPillTextReady: {
    color: "#10b981",
  },
  statusPillTextFailed: {
    color: "#ef4444",
  },
  statusPillTextInProgress: {
    color: "#3b82f6",
  },
  provisionButton: {
    borderColor: "#ec4899",
    backgroundColor: "#fdf2f8",
  },
  provisioningButton: {
    borderColor: "#ec4899",
    backgroundColor: "#fdf2f8",
  },
    iconButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    maxHeight: "85%",
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  inputLabel: {
    color: "#4b5563",
    marginTop: 10,
    marginBottom: 6,
    fontSize: 12,
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    color: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "500",
  },
  branchPicker: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  branchPickerLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  branchPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  branchPickerValue: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    flexWrap: "wrap",
  },
  primaryButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 90,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#f9fafb",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 90,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111827",
    fontWeight: "700",
  },
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  branchRowText: {
    color: "#4b5563",
    fontSize: 14,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  deleteModalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  deleteModalDescription: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
    marginBottom: 24,
  },
  deleteModalButtons: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4b5563",
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
  },
  deleteButtonDisabled: {
    backgroundColor: "#6b7280",
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  provisionConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#10b981",
    alignItems: "center",
  },
  provisionConfirmButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
    zIndex: 1000,
    elevation: 1000,
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  bottomSheetBody: {
    padding: 20,
    maxHeight: 400,
  },
  bottomSheetOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 8,
    backgroundColor: "#f9fafb",
  },
  bottomSheetOptionActive: {
    backgroundColor: "#fdf2f8",
    borderColor: "#ec4899",
  },
  bottomSheetOptionText: {
    fontSize: 14,
    color: "#4b5563",
    fontWeight: "600",
  },
  bottomSheetOptionTextActive: {
    color: "#ec4899",
  },
  switchContainer: {
    padding: 4,
  },
  switch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
  },
  switchActive: {
    backgroundColor: "#ec4899",
  },
  switchInactive: {
    backgroundColor: "#d1d5db",
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    position: "absolute",
  },
  switchThumbActive: {
    backgroundColor: "#fff",
    transform: [{ translateX: 22 }],
  },
  switchThumbInactive: {
    backgroundColor: "#ffffff",
    transform: [{ translateX: 2 }],
  },
  switchLoading: {
    justifyContent: "center",
    alignItems: "center",
    opacity: 0.6,
  },
  switchDisabled: {
    opacity: 0.4,
  },
  deviceLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 12,
    zIndex: 1,
  },
  deletionInfoBox: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  deletionInfoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  deletionInfoItem: {
    fontSize: 13,
    color: "#4b5563",
    marginBottom: 4,
    paddingLeft: 16,
  },
  successIconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  warningsContainer: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  warningsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#92400e",
    marginBottom: 8,
  },
  warningItem: {
    fontSize: 13,
    color: "#78350f",
    marginBottom: 4,
    lineHeight: 18,
  },
  deviceNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  currentDeviceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ec4899",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  currentDeviceBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  successButton: {
    backgroundColor: "#10b981",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  successButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  errorIconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  errorButton: {
    backgroundColor: "#ef4444",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  errorButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  assignButton: {
    backgroundColor: "#10b981",
  },
});
