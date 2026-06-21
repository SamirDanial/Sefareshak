import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Switch,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import branchService, { type FiskalyEnvironment, type Organization, type OrganizationSettings } from "@/src/services/branchService";
import ValidationDialog from "@/components/admin/ValidationDialog";

export default function OrganizationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken, userType, isLoading: authLoading } = useAuthRole();
  const { isSuperAdmin: isSuperAdminFromPermissions } = usePermissions();
  const isSuperAdmin = userType === "SUPER_ADMIN" || isSuperAdminFromPermissions;

  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + getAdminHeaderHeight();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);

  const [name, setName] = useState("");
  const [maxActiveBranches, setMaxActiveBranches] = useState<string>("");
  const [reservationsAllowed, setReservationsAllowed] = useState<boolean>(true);
  const [onlinePaymentsAllowed, setOnlinePaymentsAllowed] = useState<boolean>(true);
  const [cardPaymentsAllowed, setCardPaymentsAllowed] = useState<boolean>(true);
  const [paypalAllowed, setPaypalAllowed] = useState<boolean>(true);
  const [vouchersAllowed, setVouchersAllowed] = useState<boolean>(true);
  const [freeVersion, setFreeVersion] = useState<boolean>(false);

  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionsOrg, setActionsOrg] = useState<Organization | null>(null);

  const [fiskalyDialogOpen, setFiskalyDialogOpen] = useState(false);
  const [fiskalyOrg, setFiskalyOrg] = useState<Organization | null>(null);
  const [fiskalyLoading, setFiskalyLoading] = useState(false);
  const [fiskalySaving, setFiskalySaving] = useState(false);
  const [fiskalyEnabled, setFiskalyEnabled] = useState(false);
  const [fiskalyEnvironment, setFiskalyEnvironment] = useState<FiskalyEnvironment>("TEST");
  const [fiskalyApiBaseUrl, setFiskalyApiBaseUrl] = useState("");
  const [fiskalyClientId, setFiskalyClientId] = useState("");
  const [fiskalyClientSecret, setFiskalyClientSecret] = useState("");
  const [fiskalyManagedOrganizationId, setFiskalyManagedOrganizationId] = useState("");
  const [fiskalyTssId, setFiskalyTssId] = useState<string>("");
  const [fiskalyProvisioningStatus, setFiskalyProvisioningStatus] = useState<string>("");
  const [fiskalyProvisioningLastError, setFiskalyProvisioningLastError] = useState<string>("");
  const [fiskalyEnvironmentSheetOpen, setFiskalyEnvironmentSheetOpen] = useState(false);

  // German Tax Information (DSFinV-K)
  const [taxNumber, setTaxNumber] = useState<string>("");
  const [vatId, setVatId] = useState<string>("");
  const [fiscalName, setFiscalName] = useState<string>("");
  const [fiscalStreet, setFiscalStreet] = useState<string>("");
  const [fiscalZip, setFiscalZip] = useState<string>("");
  const [fiscalCity, setFiscalCity] = useState<string>("");
  const [fiscalCountry, setFiscalCountry] = useState<string>("DEU");

  // Toggle Fiskaly confirmation dialog state
  const [toggleFiskalyConfirmOpen, setToggleFiskalyConfirmOpen] = useState(false);
  const [toggleFiskalyLoading, setToggleFiskalyLoading] = useState(false);
  const [toggleFiskalyAction, setToggleFiskalyAction] = useState<null | "pause" | "permanent">(null);
  const [fiskalyPermanentlyDisabledOpen, setFiskalyPermanentlyDisabledOpen] = useState(false);

  // Rotate Fiskaly confirmation dialog state
  const [rotateFiskalyConfirmOpen, setRotateFiskalyConfirmOpen] = useState(false);
  const [rotateFiskalyLoading, setRotateFiskalyLoading] = useState(false);

  // Decommission/Recommission confirmation dialog state
  const [decommissionFiskalyConfirmOpen, setDecommissionFiskalyConfirmOpen] = useState(false);
  const [decommissionFiskalyLoading, setDecommissionFiskalyLoading] = useState(false);
  const [recommissionFiskalyConfirmOpen, setRecommissionFiskalyConfirmOpen] = useState(false);
  const [recommissionFiskalyLoading, setRecommissionFiskalyLoading] = useState(false);

  // Fiskaly verification status
  const [fiskalyVerificationStatus, setFiskalyVerificationStatus] = useState<any>(null);
  const [fiskalyVerificationLoading, setFiskalyVerificationLoading] = useState(false);

  // German Tax Information saving state
  const [saveTaxInfoLoading, setSaveTaxInfoLoading] = useState(false);
  const [verifyTaxInfoLoading, setVerifyTaxInfoLoading] = useState(false);
  const [taxInfoVerifyModalOpen, setTaxInfoVerifyModalOpen] = useState(false);
  const [taxInfoVerifyData, setTaxInfoVerifyData] = useState<any>(null);

  // Inline feedback message for Save to Fiskaly button
  const [saveTaxInfoMessage, setSaveTaxInfoMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Validation states
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [selectedOrgForValidation, setSelectedOrgForValidation] = useState<Organization | null>(null);
  const [validationMode, setValidationMode] = useState<"create" | "edit">("create");
  const [existingValidation, setExistingValidation] = useState<any>(null);
  
  // Unvalidate validation dialog states
  const [unvalidateDialogOpen, setUnvalidateDialogOpen] = useState(false);
  const [selectedOrgForUnvalidate, setSelectedOrgForUnvalidate] = useState<Organization | null>(null);
  const [selectedValidationIdForUnvalidate, setSelectedValidationIdForUnvalidate] = useState<string | null>(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "validated" | "unvalidated" | "expired" | "grace_period" | "inactive">("validated");
  const [statusFilterSheetOpen, setStatusFilterSheetOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isSuperAdmin) {
      router.replace("/(admin)" as any);
    }
  }, [authLoading, isSuperAdmin, router]);

  const resetForm = useCallback(() => {
    setActiveOrg(null);
    setName("");
    setMaxActiveBranches("");
    setFreeVersion(false);
    setReservationsAllowed(true);
    setOnlinePaymentsAllowed(true);
    setCardPaymentsAllowed(true);
    setPaypalAllowed(true);
    setVouchersAllowed(true);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setDialogOpen(true);
  }, [resetForm]);

  const openEdit = useCallback((org: Organization) => {
    setActiveOrg(org);
    setName(org.name || "");
    setMaxActiveBranches(
      org.freeVersion === true 
        ? "1"
        : org.maxActiveBranches !== null && org.maxActiveBranches !== undefined
        ? String(org.maxActiveBranches)
        : ""
    );
    setFreeVersion(org.freeVersion === true);
    setReservationsAllowed(org.reservationsAllowed !== false);
    setOnlinePaymentsAllowed(org.onlinePaymentsAllowed !== false);
    setCardPaymentsAllowed(org.cardPaymentsAllowed !== false);
    setPaypalAllowed(org.paypalAllowed !== false);
    setVouchersAllowed(org.vouchersAllowed !== false);
    setDialogOpen(true);
  }, []);

  const loadOrganizations = useCallback(async () => {
    if (!isSuperAdmin) return;

    try {
      if (!refreshing) setLoading(true);
      const token = await getToken();
      if (!token) return;

      // Use the validation API for super admin
      try {
        const options: any = {
          page: 1,
          limit: 50,
        };
        
        // Add search filter
        if (searchTerm.trim()) {
          options.search = searchTerm.trim();
        }
        
        // Add status filter
        if (statusFilter !== "all") {
          options.status = statusFilter;
        }

        const response = await branchService.getOrganizationsWithValidation(token, options);
        setOrganizations(response.data || []);
      } catch (validationError: any) {
        console.warn("Validation API failed, falling back to regular API:", validationError);
        // Fallback to regular API if validation API fails
        const orgs = await branchService.getOrganizations(token);
        setOrganizations(orgs);
      }
    } catch (e: any) {
      console.error("Failed to load organizations:", e);
      setToast({
        visible: true,
        message: e?.message || t("admin.organizations.errorLoading"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken, isSuperAdmin, refreshing, searchTerm, statusFilter, t]);

  useEffect(() => {
    loadOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  // Reload organizations when filters change
  useEffect(() => {
    if (isSuperAdmin) {
      loadOrganizations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrganizations();
  }, [loadOrganizations]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setToast({
        visible: true,
        message: t("admin.organizations.nameRequired"),
        type: "error",
      });
      return;
    }

    try {
      setSaving(true);
      const token = await getToken();
      if (!token) return;

      if (activeOrg) {
        const payload: any = { name: trimmed };
        const raw = maxActiveBranches.trim();
        payload.maxActiveBranches = raw.length === 0 ? null : Number(raw);
        payload.freeVersion = Boolean(freeVersion);
        payload.vouchersAllowed = Boolean(vouchersAllowed);
        if (!freeVersion) {
          payload.reservationsAllowed = Boolean(reservationsAllowed);
          payload.onlinePaymentsAllowed = Boolean(onlinePaymentsAllowed);
          payload.cardPaymentsAllowed = Boolean(cardPaymentsAllowed);
          payload.paypalAllowed = Boolean(paypalAllowed);
        }

        await branchService.updateOrganization(activeOrg.id, payload, token);
        setToast({
          visible: true,
          message: t("admin.organizations.updated"),
          type: "success",
        });
      } else {
        const payload: any = { name: trimmed };
        const raw = maxActiveBranches.trim();
        payload.maxActiveBranches = raw.length === 0 ? null : Number(raw);
        payload.freeVersion = Boolean(freeVersion);
        payload.vouchersAllowed = Boolean(vouchersAllowed);
        if (!freeVersion) {
          payload.reservationsAllowed = Boolean(reservationsAllowed);
          payload.onlinePaymentsAllowed = Boolean(onlinePaymentsAllowed);
          payload.cardPaymentsAllowed = Boolean(cardPaymentsAllowed);
          payload.paypalAllowed = Boolean(paypalAllowed);
        }

        await branchService.createOrganization(payload, token);
        setToast({
          visible: true,
          message: t("admin.organizations.created"),
          type: "success",
        });
      }

      setDialogOpen(false);
      resetForm();
      await loadOrganizations();
    } catch (e: any) {
      console.error("Failed to save organization:", e);
      setToast({
        visible: true,
        message: e?.message || t("admin.organizations.errorSaving"),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [
    activeOrg,
    cardPaymentsAllowed,
    freeVersion,
    getToken,
    loadOrganizations,
    maxActiveBranches,
    name,
    onlinePaymentsAllowed,
    paypalAllowed,
    reservationsAllowed,
    resetForm,
    t,
    vouchersAllowed,
  ]);

  const toggleActive = useCallback(
    async (org: Organization, nextActive: boolean) => {
      try {
        const token = await getToken();
        if (!token) return;

        setActionLoadingId(org.id);
        await branchService.updateOrganization(org.id, { isActive: nextActive }, token);
        setOrganizations((prev) =>
          prev.map((o) => (o.id === org.id ? { ...o, isActive: nextActive } : o))
        );
      } catch (e: any) {
        console.error("Failed to update organization:", e);
        setToast({
          visible: true,
          message: e?.message || t("admin.organizations.errorUpdating"),
          type: "error",
        });
      } finally {
        setActionLoadingId(null);
      }
    },
    [getToken, t]
  );

  // Helper function to get validation status
  const getValidationStatus = (org: Organization) => {
    // Check for temporarily unvalidated (has validations but org.isValidated is false)
    if (!org.isValidated && org.validations && org.validations.length > 0) {
      const latestValidation = org.validations[0];
      if (latestValidation.isActive === false && latestValidation.unvalidatedAt) {
        return {
          status: "temporarily_unvalidated",
          label: t("admin.organizations.validation.temporarilyUnvalidated"),
          color: "#f97316", // orange
          icon: "pause",
        };
      }
    }

    if (!org.isValidated) {
      return {
        status: "unvalidated",
        label: t("admin.organizations.validation.unvalidated"),
        color: "#6b7280", // gray
        icon: "alert-circle",
      };
    }

    const now = new Date();
    const expiresAt = org.validationExpiresAt ? new Date(org.validationExpiresAt) : null;
    const gracePeriodEndsAt = org.gracePeriodEndsAt ? new Date(org.gracePeriodEndsAt) : null;

    if (!expiresAt) {
      return {
        status: "unvalidated",
        label: t("admin.organizations.validation.unvalidated"),
        color: "#6b7280", // gray
        icon: "alert-circle",
      };
    }

    if (now <= expiresAt) {
      return {
        status: "valid",
        label: t("admin.organizations.validation.valid"),
        color: "#22c55e", // green
        icon: "check-circle",
      };
    }

    if (gracePeriodEndsAt && now <= gracePeriodEndsAt) {
      return {
        status: "grace_period",
        label: t("admin.organizations.validation.gracePeriod"),
        color: "#eab308", // yellow
        icon: "clock",
      };
    }

    return {
      status: "expired",
      label: t("admin.organizations.validation.expired"),
      color: "#ef4444", // red
      icon: "alert-circle",
    };
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Open validation dialog
  const openValidationDialog = (org: Organization) => {
    setSelectedOrgForValidation(org);
    setValidationMode("create");
    setExistingValidation(null);
    setValidationDialogOpen(true);
  };

  // Open edit validation dialog
  const openEditValidationDialog = async (org: Organization) => {
    try {
      const token = await getToken();
      if (!token) return;

      const orgWithValidation = await branchService.getOrganizationValidation(org.id, token);
      const latestValidation = orgWithValidation.validations && orgWithValidation.validations.length > 0 
        ? orgWithValidation.validations[0] 
        : null;

      // Find the corresponding payment record for this validation
      const paymentRecord = latestValidation && orgWithValidation.validationPayments
        ? orgWithValidation.validationPayments.find(payment => payment.validationId === latestValidation.id)
        : null;

      // Merge validation and payment data
      const validationWithPayment = latestValidation ? {
        ...latestValidation,
        amount: paymentRecord?.amount,
        currency: paymentRecord?.currency,
        paymentMethod: paymentRecord?.paymentMethod,
        paymentStatus: paymentRecord?.paymentStatus,
      } : null;

      setSelectedOrgForValidation(org);
      setValidationMode("edit");
      setExistingValidation(validationWithPayment);
      setValidationDialogOpen(true);
    } catch (error: any) {
      console.error("Failed to load validation details:", error);
      setToast({
        visible: true,
        message: error?.message || t("admin.organizations.validation.loadError"),
        type: "error",
      });
    }
  };

  // Unvalidate validation (temporary for non-payment)
  const unvalidateValidation = (org: Organization) => {
    if (!org.validations || org.validations.length === 0) {
      setToast({
        visible: true,
        message: t("admin.organizations.validation.noValidationToUnvalidate"),
        type: "error",
      });
      return;
    }

    setSelectedOrgForUnvalidate(org);
    setSelectedValidationIdForUnvalidate(org.validations[0].id);
    setUnvalidateDialogOpen(true);
  };

  // Reactivate validation (restore temporarily unvalidated validation)
  const reactivateValidation = async (org: Organization) => {
    if (!org.validations || org.validations.length === 0) {
      setToast({
        visible: true,
        message: t("admin.organizations.validation.noValidationToReactivate"),
        type: "error",
      });
      return;
    }

    try {
      const token = await getToken();
      if (!token) return;

      const latestValidation = org.validations[0];
      await branchService.reactivateValidation(org.id, latestValidation.id, token);
      
      setToast({
        visible: true,
        message: t("admin.organizations.validation.reactivated", { orgName: org.name }),
        type: "success",
      });
      await loadOrganizations();
    } catch (error: any) {
      console.error("Failed to reactivate validation:", error);
      setToast({
        visible: true,
        message: error?.message || t("admin.organizations.validation.reactivateError"),
        type: "error",
      });
    }
  };

  const sortedOrganizations = useMemo(() => {
    const list = [...organizations];
    list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return list;
  }, [organizations]);

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);

    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection("down");
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection("up");
    }

    lastScrollY.current = currentScrollY;
  };

  if (!isSuperAdmin) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
        <ActivityIndicator size="small" color="#ec4899" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
          />
        }
      >
        <View style={styles.headerBlock}>
          <Text style={styles.pageTitle}>{t("admin.organizations.title")}</Text>
          <Text style={styles.pageDescription}>{t("admin.organizations.description")}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t("admin.organizations.title")}</Text>
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={openCreate}
              disabled={loading}
            >
              <MaterialCommunityIcons name="plus" size={16} color="#fff" />
              <Text style={styles.primaryButtonText}>{t("admin.organizations.create")}</Text>
            </TouchableOpacity>
          </View>

          {/* Filters Section */}
          <View style={styles.filtersSection}>
            <View style={styles.searchInputContainer}>
              <MaterialCommunityIcons name="magnify" size={20} color="#6B7280" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={t("admin.organizations.searchPlaceholder")}
                placeholderTextColor="#6B7280"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>
            
            <TouchableOpacity
              style={styles.statusFilterButton}
              onPress={() => setStatusFilterSheetOpen(true)}
            >
              <Text style={styles.statusFilterText}>
                {statusFilter === "all" && t("admin.organizations.validation.allStatuses")}
                {statusFilter === "validated" && t("admin.organizations.validation.validated")}
                {statusFilter === "unvalidated" && t("admin.organizations.validation.unvalidated")}
                {statusFilter === "expired" && t("admin.organizations.validation.expired")}
                {statusFilter === "grace_period" && t("admin.organizations.validation.gracePeriod")}
                {statusFilter === "inactive" && t("admin.organizations.inactive")}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.cardBody}>
            {loading ? (
              <View style={styles.inlineLoadingRow}>
                <ActivityIndicator size="small" color="#ec4899" />
                <Text style={styles.inlineLoadingText}>{t("common.loading")}</Text>
              </View>
            ) : sortedOrganizations.length === 0 ? (
              <Text style={styles.emptyText}>{t("admin.organizations.empty")}</Text>
            ) : (
              <View style={{ gap: 12 }}>
                {sortedOrganizations.map((org) => {
                  const isActive = org.isActive !== false;
                  const statusText = isActive
                    ? t("admin.organizations.active")
                    : t("admin.organizations.inactive");

                  const validationStatus = getValidationStatus(org);
                  // Get expiration date from the latest validation record, not the organization field
                  const latestValidation = org.validations && org.validations.length > 0 ? org.validations[0] : null;
                  const expiresDate = formatDate(latestValidation?.expiresAt || org.validationExpiresAt);
                  const gracePeriodDate = formatDate(latestValidation?.gracePeriodEndsAt || org.gracePeriodEndsAt);

                  const canOpenActions = actionLoadingId !== org.id;

                  return (
                    <View key={org.id} style={styles.orgCard}>
                      <View style={styles.orgTopRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.orgNameRow}>
                            <Text style={styles.orgName} numberOfLines={1}>
                              {org.name || org.id}
                            </Text>
                            <View
                              style={[
                                styles.statusPill,
                                isActive ? styles.statusPillActive : styles.statusPillInactive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusPillText,
                                  isActive
                                    ? styles.statusPillTextActive
                                    : styles.statusPillTextInactive,
                                ]}
                              >
                                {statusText}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.statusPill,
                                { backgroundColor: `${validationStatus.color}20` },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusPillText,
                                  { color: validationStatus.color },
                                ]}
                              >
                                {validationStatus.label}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.slugText} numberOfLines={1}>
                            {t("common.slug")}: {org.slug || "-"}
                          </Text>
                          {org.organizationNumber && (
                            <Text style={styles.slugText} numberOfLines={1}>
                              {t("admin.organizations.organizationNumber") || "ID"}: {org.organizationNumber}
                            </Text>
                          )}

                          {/* Validation information */}
                          {org.isValidated && (
                            <View style={styles.validationInfo}>
                              {expiresDate && (
                                <Text style={styles.validationText}>
                                  {t("admin.organizations.validation.expiresOn")}: {expiresDate}
                                </Text>
                              )}
                              {validationStatus.status === "grace_period" && gracePeriodDate && (
                                <Text style={styles.gracePeriodText}>
                                  {t("admin.organizations.validation.gracePeriodEnds")}: {gracePeriodDate}
                                </Text>
                              )}
                              {latestValidation?.notes && (
                                <Text style={styles.validationText} numberOfLines={1}>
                                  {t("admin.organizations.validation.validationNotes")}: {latestValidation.notes}
                                </Text>
                              )}
                            </View>
                          )}

                          {/* Branch count */}
                          {org._count && (
                            <Text style={styles.branchCountText}>
                              {t("admin.organizations.branchCount", { 
                                count: org._count?.branches || 0 
                              })}
                            </Text>
                          )}
                        </View>

                        <TouchableOpacity
                          style={styles.menuButton}
                          onPress={() => {
                            if (!canOpenActions) return;
                            setActionsOrg(org);
                            setActionsModalVisible(true);
                          }}
                          disabled={!canOpenActions}
                        >
                          {actionLoadingId === org.id ? (
                            <ActivityIndicator size="small" color="#6b7280" />
                          ) : (
                            <MaterialCommunityIcons name="dots-vertical" size={18} color="#6b7280" />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          setActionsModalVisible(false);
          setActionsOrg(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setActionsModalVisible(false);
            setActionsOrg(null);
          }}
        >
          <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            {actionsOrg && (
              <View style={styles.sheetContent}>
                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    setActionsModalVisible(false);
                    const org = actionsOrg;
                    setActionsOrg(null);
                    setTimeout(() => openEdit(org), 250);
                  }}
                >
                  <MaterialCommunityIcons name="pencil" size={16} color="#4b5563" />
                  <Text style={styles.sheetItemText}>{t("admin.organizations.edit")}</Text>
                </TouchableOpacity>

                {isSuperAdmin && (
                  <>
                    <TouchableOpacity
                      style={styles.sheetItem}
                      onPress={() => {
                        const org = actionsOrg;
                        setActionsModalVisible(false);
                        setActionsOrg(null);
                        setTimeout(async () => {
                          try {
                            const token = await getToken();
                            if (!token) return;
                            setFiskalyOrg(org);
                            setFiskalyDialogOpen(true);
                            setFiskalyLoading(true);
                            const settings = await branchService.getOrganizationSettings(org.id, token);
                            setFiskalyEnabled(Boolean((settings as any)?.fiskalyEnabled));
                            const envRaw = String((settings as any)?.fiskalyEnvironment || "TEST").toUpperCase();
                            setFiskalyEnvironment(envRaw === "LIVE" ? "LIVE" : "TEST");
                            setFiskalyApiBaseUrl(String((settings as any)?.fiskalyApiBaseUrl || ""));
                            setFiskalyClientId(String((settings as any)?.fiskalyClientId || ""));
                            setFiskalyClientSecret(String((settings as any)?.fiskalyClientSecret || ""));
                            setFiskalyManagedOrganizationId(
                              String((settings as any)?.fiskalyManagedOrganizationId || "")
                            );
                            setFiskalyTssId(String((settings as any)?.fiskalyTssId || ""));
                            setFiskalyProvisioningStatus(
                              String((settings as any)?.fiskalyProvisioningStatus || "")
                            );
                            const lastCode = String(
                              (settings as any)?.fiskalyProvisioningLastErrorCode || ""
                            );
                            const lastMsg = String(
                              (settings as any)?.fiskalyProvisioningLastErrorMessage || ""
                            );
                            setFiskalyProvisioningLastError(
                              [lastCode, lastMsg].filter(Boolean).join(": ")
                            );
                            // Load German tax information for DSFinV-K
                            setTaxNumber(String((settings as any)?.taxNumber || ""));
                            setVatId(String((settings as any)?.vatId || ""));
                            setFiscalName(String((settings as any)?.fiscalName || ""));
                            setFiscalStreet(String((settings as any)?.fiscalStreet || ""));
                            setFiscalZip(String((settings as any)?.fiscalZip || ""));
                            setFiscalCity(String((settings as any)?.fiscalCity || ""));
                            setFiscalCountry(String((settings as any)?.fiscalCountry || "DEU"));
                          } catch (e: any) {
                            setToast({
                              visible: true,
                              message: e?.message || t("common.error"),
                              type: "error",
                            });
                          } finally {
                            setFiskalyLoading(false);
                          }
                        }, 250);
                      }}
                      disabled={actionLoadingId === actionsOrg.id}
                    >
                      <MaterialCommunityIcons name="shield-check" size={16} color="#4b5563" />
                      <Text style={styles.sheetItemText}>Fiskaly</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.sheetItem}
                      onPress={() => {
                        setActionsModalVisible(false);
                        const org = actionsOrg;
                        setActionsOrg(null);
                        setTimeout(() => openValidationDialog(org), 250);
                      }}
                      disabled={actionLoadingId === actionsOrg.id}
                    >
                      <MaterialCommunityIcons name="calendar" size={16} color="#4b5563" />
                      <Text style={styles.sheetItemText}>
                        {actionsOrg.isValidated 
                          ? t("admin.organizations.validation.revalidate")
                          : t("admin.organizations.validation.validateOrganization")
                        }
                      </Text>
                    </TouchableOpacity>

                    {actionsOrg.isValidated && (
                      <TouchableOpacity
                        style={styles.sheetItem}
                        onPress={() => {
                          setActionsModalVisible(false);
                          const org = actionsOrg;
                          setActionsOrg(null);
                          setTimeout(() => openEditValidationDialog(org), 250);
                        }}
                        disabled={actionLoadingId === actionsOrg.id}
                      >
                        <MaterialCommunityIcons name="pencil" size={16} color="#4b5563" />
                        <Text style={styles.sheetItemText}>{t("admin.organizations.validation.editValidation")}</Text>
                      </TouchableOpacity>
                    )}

                    {actionsOrg.isValidated && (
                      <TouchableOpacity
                        style={styles.sheetItem}
                        onPress={() => {
                          const org = actionsOrg;
                          setActionsModalVisible(false);
                          setActionsOrg(null);
                          setTimeout(() => unvalidateValidation(org), 250);
                        }}
                        disabled={actionLoadingId === actionsOrg.id}
                      >
                        <MaterialCommunityIcons name="pause" size={16} color="#f97316" />
                        <Text style={styles.sheetItemText}>{t("admin.organizations.validation.temporarilyUnvalidate")}</Text>
                      </TouchableOpacity>
                    )}

                    {/* Show Reactivate option for temporarily unvalidated organizations */}
                    {!actionsOrg.isValidated && actionsOrg.validations && actionsOrg.validations.length > 0 && actionsOrg.validations[0].isActive === false && actionsOrg.validations[0].unvalidatedAt && (
                      <TouchableOpacity
                        style={styles.sheetItem}
                        onPress={() => {
                          const org = actionsOrg;
                          setActionsModalVisible(false);
                          setActionsOrg(null);
                          setTimeout(() => reactivateValidation(org), 250);
                        }}
                        disabled={actionLoadingId === actionsOrg.id}
                      >
                        <MaterialCommunityIcons name="check-circle" size={16} color="#22c55e" />
                        <Text style={styles.sheetItemText}>{t("admin.organizations.validation.reactivateValidation")}</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    const org = actionsOrg;
                    const nextActive = org.isActive === false;
                    setActionsModalVisible(false);
                    setActionsOrg(null);
                    toggleActive(org, nextActive);
                  }}
                  disabled={actionLoadingId === actionsOrg.id}
                >
                  <MaterialCommunityIcons
                    name={actionsOrg.isActive === false ? "eye" : "eye-off"}
                    size={16}
                    color="#4b5563"
                  />
                  <Text style={styles.sheetItemText}>
                    {actionsOrg.isActive === false
                      ? t("admin.organizations.activate")
                      : t("admin.organizations.deactivate")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => {
                    setActionsModalVisible(false);
                    setActionsOrg(null);
                  }}
                >
                  <Text style={styles.sheetCancelText}>{t("common.cancel")}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={fiskalyPermanentlyDisabledOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setFiskalyPermanentlyDisabledOpen(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>
              {t("admin.organizations.fiskaly.permanentlyDisabled.title")}
            </Text>
            <Text style={styles.confirmMessage}>
              {t("admin.organizations.fiskaly.permanentlyDisabled.message")}
            </Text>

            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancel]}
                onPress={() => setFiskalyPermanentlyDisabledOpen(false)}
              >
                <Text style={styles.confirmCancelText}>
                  {t("common.close")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmDisable]}
                onPress={() => {
                  setFiskalyPermanentlyDisabledOpen(false);
                  setRotateFiskalyConfirmOpen(true);
                }}
              >
                <Text style={styles.confirmDisableText}>
                  {t("admin.organizations.fiskaly.rotate.button")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmDisable]}
                onPress={() => {
                  setFiskalyPermanentlyDisabledOpen(false);
                  setRecommissionFiskalyConfirmOpen(true);
                }}
              >
                <Text style={styles.confirmDisableText}>
                  {t("admin.organizations.fiskaly.recommission.button")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={rotateFiskalyConfirmOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setRotateFiskalyConfirmOpen(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>
              {t("admin.organizations.fiskaly.rotate.title")}
            </Text>
            <Text style={styles.confirmMessage}>
              {t("admin.organizations.fiskaly.rotate.message")}
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancel]}
                onPress={() => setRotateFiskalyConfirmOpen(false)}
                disabled={rotateFiskalyLoading}
              >
                <Text style={styles.confirmCancelText}>
                  {t("admin.organizations.fiskaly.rotate.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmRotate]}
                onPress={async () => {
                  if (!fiskalyOrg) return;
                  try {
                    setRotateFiskalyLoading(true);
                    const token = await getToken();
                    if (!token) return;
                    const resp = await branchService.rotateFiskalyForOrganization(fiskalyOrg.id, token);

                    // Refresh local state from response if possible
                    const nextSettings = (resp as any)?.data?.data ?? (resp as any)?.data ?? null;
                    if (nextSettings) {
                      setFiskalyEnabled(Boolean((nextSettings as any)?.fiskalyEnabled));
                      const envRaw = String((nextSettings as any)?.fiskalyEnvironment || "TEST").toUpperCase();
                      setFiskalyEnvironment(envRaw === "LIVE" ? "LIVE" : "TEST");
                      setFiskalyApiBaseUrl(String((nextSettings as any)?.fiskalyApiBaseUrl || ""));
                      setFiskalyClientId(String((nextSettings as any)?.fiskalyClientId || ""));
                      setFiskalyClientSecret(String((nextSettings as any)?.fiskalyClientSecret || ""));
                      setFiskalyTssId(String((nextSettings as any)?.fiskalyTssId || ""));
                      setFiskalyProvisioningStatus(String((nextSettings as any)?.fiskalyProvisioningStatus || ""));
                      const lastCode = String((nextSettings as any)?.fiskalyProvisioningLastErrorCode || "");
                      const lastMsg = String((nextSettings as any)?.fiskalyProvisioningLastErrorMessage || "");
                      setFiskalyProvisioningLastError([lastCode, lastMsg].filter(Boolean).join(": "));
                      // Load German tax information for DSFinV-K
                      setTaxNumber(String((nextSettings as any)?.taxNumber || ""));
                      setVatId(String((nextSettings as any)?.vatId || ""));
                      setFiscalName(String((nextSettings as any)?.fiscalName || ""));
                      setFiscalStreet(String((nextSettings as any)?.fiscalStreet || ""));
                      setFiscalZip(String((nextSettings as any)?.fiscalZip || ""));
                      setFiscalCity(String((nextSettings as any)?.fiscalCity || ""));
                      setFiscalCountry(String((nextSettings as any)?.fiscalCountry || "DEU"));
                    }

                    setToast({
                      visible: true,
                      message: t("admin.organizations.fiskaly.rotate.success"),
                      type: "success",
                    });
                    setRotateFiskalyConfirmOpen(false);
                  } catch (e: any) {
                    setToast({
                      visible: true,
                      message: e?.message || t("common.error"),
                      type: "error",
                    });
                  } finally {
                    setRotateFiskalyLoading(false);
                  }
                }}
                disabled={rotateFiskalyLoading}
              >
                {rotateFiskalyLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmRotateText}>
                    {t("admin.organizations.fiskaly.rotate.confirm")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={decommissionFiskalyConfirmOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setDecommissionFiskalyConfirmOpen(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>
              {t("admin.organizations.fiskaly.decommission.title")}
            </Text>
            <Text style={styles.confirmMessage}>
              {t("admin.organizations.fiskaly.decommission.message")}
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancel]}
                onPress={() => setDecommissionFiskalyConfirmOpen(false)}
                disabled={decommissionFiskalyLoading}
              >
                <Text style={styles.confirmCancelText}>{t("admin.organizations.fiskaly.decommission.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmDecommission]}
                onPress={async () => {
                  if (!fiskalyOrg) return;
                  try {
                    setDecommissionFiskalyLoading(true);
                    const token = await getToken();
                    if (!token) return;
                    const resp = await branchService.decommissionFiskalyForOrganization(fiskalyOrg.id, token);
                    const data = (resp as any)?.data;
                    setToast({
                      visible: true,
                      message: data?.requiresManualAction
                        ? t("admin.organizations.fiskaly.decommission.manual")
                        : t("admin.organizations.fiskaly.decommission.success"),
                      type: data?.requiresManualAction ? "info" : "success",
                    });
                    // Refresh local state
                    setFiskalyEnabled(false);
                    setFiskalyProvisioningStatus("FAILED");
                    setDecommissionFiskalyConfirmOpen(false);
                  } catch (e: any) {
                    setToast({
                      visible: true,
                      message: e?.message || t("common.error"),
                      type: "error",
                    });
                  } finally {
                    setDecommissionFiskalyLoading(false);
                  }
                }}
                disabled={decommissionFiskalyLoading}
              >
                {decommissionFiskalyLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmDecommissionText}>{t("admin.organizations.fiskaly.decommission.confirm")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={recommissionFiskalyConfirmOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setRecommissionFiskalyConfirmOpen(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>
              {t("admin.organizations.fiskaly.recommission.title")}
            </Text>
            <Text style={styles.confirmMessage}>
              {t("admin.organizations.fiskaly.recommission.message")}
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancel]}
                onPress={() => setRecommissionFiskalyConfirmOpen(false)}
                disabled={recommissionFiskalyLoading}
              >
                <Text style={styles.confirmCancelText}>{t("admin.organizations.fiskaly.recommission.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmRecommission]}
                onPress={async () => {
                  if (!fiskalyOrg) return;
                  try {
                    setRecommissionFiskalyLoading(true);
                    const token = await getToken();
                    if (!token) return;
                    const resp = await branchService.recommissionFiskalyForOrganization(fiskalyOrg.id, token);
                    const data = (resp as any)?.data;
                    setToast({
                      visible: true,
                      message: t("admin.organizations.fiskaly.recommission.success"),
                      type: "success",
                    });
                    // Refresh local state
                    setFiskalyEnabled(true);
                    setFiskalyProvisioningStatus("READY");
                    if (data?.newClientId) {
                      setFiskalyClientId(data.newClientId);
                    }
                    setRecommissionFiskalyConfirmOpen(false);
                  } catch (e: any) {
                    setToast({
                      visible: true,
                      message: e?.message || t("common.error"),
                      type: "error",
                    });
                  } finally {
                    setRecommissionFiskalyLoading(false);
                  }
                }}
                disabled={recommissionFiskalyLoading}
              >
                {recommissionFiskalyLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmRecommissionText}>{t("admin.organizations.fiskaly.recommission.confirm")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dialogOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          setDialogOpen(false);
          resetForm();
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setDialogOpen(false);
            resetForm();
          }}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeaderRow}>
                <Text style={styles.sheetHeaderTitle}>
                  {activeOrg
                    ? t("admin.organizations.edit")
                    : t("admin.organizations.create")}
                </Text>
                <TouchableOpacity
                  style={styles.sheetCloseInline}
                  onPress={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.sheetScroll}
              >
                <View style={styles.sheetForm}>
                  <View style={styles.dialogField}>
                    <Text style={styles.dialogLabel}>
                      {t("admin.organizations.name")} <Text style={styles.required}>*</Text>
                    </Text>
                    <TextInput
                      style={styles.dialogInput}
                      placeholder={t("admin.organizations.namePlaceholder")}
                      placeholderTextColor="#6B7280"
                      value={name}
                      onChangeText={setName}
                    />
                  </View>

                  <View style={styles.entitlementsHeader}>
                    <Text style={styles.entitlementsHeaderText}>
                      {t("admin.organizations.entitlements")}
                    </Text>
                  </View>

                  <View style={styles.dialogSwitchRow}>
                    <Text style={styles.dialogLabel}>
                      {t("admin.organizations.freeVersion")}
                    </Text>
                    <TouchableOpacity
                      style={[styles.switch, freeVersion && styles.switchActive]}
                      onPress={() => {
                        const next = !freeVersion;
                        setFreeVersion(next);
                        if (next) {
                          // When free version is enabled, disable all paid features and set max branches to 1
                          setReservationsAllowed(false);
                          setOnlinePaymentsAllowed(false);
                          setCardPaymentsAllowed(false);
                          setPaypalAllowed(false);
                          setVouchersAllowed(false);
                          setMaxActiveBranches("1");
                        }
                      }}
                    >
                      <View
                        style={[
                          styles.switchThumb,
                          freeVersion && styles.switchThumbActive,
                        ]}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.dialogField}>
                    <Text style={styles.dialogLabel}>
                      {t("admin.organizations.maxActiveBranches")}
                    </Text>
                    <TextInput
                      style={[styles.dialogInput, freeVersion && styles.dialogInputDisabled]}
                      placeholder={t("admin.organizations.maxActiveBranchesPlaceholder")}
                      placeholderTextColor="#6B7280"
                      keyboardType="numeric"
                      value={maxActiveBranches}
                      editable={!freeVersion}
                      onChangeText={(text) => {
                        if (text === "") {
                          setMaxActiveBranches("");
                          return;
                        }
                        if (/^\d+$/.test(text)) {
                          const num = Number(text);
                          // Limit to 1 when free version is enabled
                          if (freeVersion && num > 1) {
                            return;
                          }
                          setMaxActiveBranches(text);
                        }
                      }}
                    />
                  </View>

                  <View style={styles.dialogSwitchRow}>
                    <Text style={styles.dialogLabel}>
                      {t("admin.organizations.reservationsAllowed")}
                    </Text>
                    <TouchableOpacity
                      style={[styles.switch, reservationsAllowed && styles.switchActive, freeVersion && styles.switchDisabled]}
                      onPress={() => setReservationsAllowed((v) => !v)}
                      disabled={freeVersion}
                    >
                      <View
                        style={[
                          styles.switchThumb,
                          reservationsAllowed && styles.switchThumbActive,
                        ]}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.dialogSwitchRow}>
                    <Text style={styles.dialogLabel}>
                      {t("admin.organizations.onlinePaymentsAllowed")}
                    </Text>
                    <TouchableOpacity
                      style={[styles.switch, onlinePaymentsAllowed && styles.switchActive, freeVersion && styles.switchDisabled]}
                      onPress={() => {
                        setOnlinePaymentsAllowed((prev) => {
                          const next = !prev;
                          if (!next) {
                            setCardPaymentsAllowed(false);
                            setPaypalAllowed(false);
                          }
                          return next;
                        });
                      }}
                      disabled={freeVersion}
                    >
                      <View
                        style={[
                          styles.switchThumb,
                          onlinePaymentsAllowed && styles.switchThumbActive,
                        ]}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.dialogSwitchRow}>
                    <Text style={styles.dialogLabel}>
                      {t("admin.organizations.cardPaymentsAllowed")}
                    </Text>
                    <TouchableOpacity
                      style={[styles.switch, cardPaymentsAllowed && styles.switchActive, freeVersion && styles.switchDisabled]}
                      onPress={() => {
                        setCardPaymentsAllowed((prev) => {
                          const next = !prev;
                          if (next) setOnlinePaymentsAllowed(true);
                          return next;
                        });
                      }}
                      disabled={freeVersion}
                    >
                      <View
                        style={[
                          styles.switchThumb,
                          cardPaymentsAllowed && styles.switchThumbActive,
                        ]}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.dialogSwitchRow}>
                    <Text style={styles.dialogLabel}>
                      {t("admin.organizations.paypalAllowed")}
                    </Text>
                    <TouchableOpacity
                      style={[styles.switch, paypalAllowed && styles.switchActive, freeVersion && styles.switchDisabled]}
                      onPress={() => {
                        setPaypalAllowed((prev) => {
                          const next = !prev;
                          if (next) setOnlinePaymentsAllowed(true);
                          return next;
                        });
                      }}
                      disabled={freeVersion}
                    >
                      <View
                        style={[styles.switchThumb, paypalAllowed && styles.switchThumbActive]}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.dialogSwitchRow}>
                    <Text style={styles.dialogLabel}>
                      {t("admin.organizations.vouchersAllowed")}
                    </Text>
                    <TouchableOpacity
                      style={[styles.switch, vouchersAllowed && styles.switchActive, freeVersion && styles.switchDisabled]}
                      onPress={() => setVouchersAllowed((v) => !v)}
                      disabled={freeVersion}
                    >
                      <View
                        style={[styles.switchThumb, vouchersAllowed && styles.switchThumbActive]}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.sheetActionsRow}>
                <TouchableOpacity
                  style={styles.dialogButtonCancel}
                  onPress={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                  disabled={saving}
                >
                  <Text style={styles.dialogButtonTextCancel}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.dialogButtonSave,
                    (!name.trim() || saving) && styles.dialogButtonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={!name.trim() || saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.dialogButtonTextSave}>{t("common.save")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={fiskalyDialogOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          setFiskalyDialogOpen(false);
          setFiskalyOrg(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setFiskalyDialogOpen(false);
            setFiskalyOrg(null);
          }}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetHeaderTitle}>Fiskaly</Text>
              <TouchableOpacity
                style={styles.sheetCloseInline}
                onPress={() => {
                  setFiskalyDialogOpen(false);
                  setFiskalyOrg(null);
                }}
              >
                <MaterialCommunityIcons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.sheetScroll}
            >
              <View style={styles.sheetForm}>
                <Text style={styles.dialogSubtitle} numberOfLines={2}>
                  {(fiskalyOrg?.name || fiskalyOrg?.id || "").trim()}
                </Text>

                {fiskalyLoading ? (
                  <View style={styles.inlineLoadingRow}>
                    <ActivityIndicator size="small" color="#ec4899" />
                    <Text style={styles.inlineLoadingText}>
                      {t("common.loading")}
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 12 }}>
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>{t("admin.organizations.fiskaly.enabled")}</Text>
                      <Switch
                        value={fiskalyEnabled}
                        onValueChange={setFiskalyEnabled}
                        trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                        thumbColor={"#fff"}
                      />
                    </View>

                    {fiskalyEnabled && (
                      <>
                        <View style={styles.kvRow}>
                          <Text style={styles.kvLabel}>{t("admin.organizations.fiskaly.environment")}</Text>
                          <TouchableOpacity
                            style={styles.envButton}
                            onPress={() => setFiskalyEnvironmentSheetOpen(true)}
                          >
                            <Text style={styles.envButtonText}>{fiskalyEnvironment}</Text>
                            <MaterialCommunityIcons name="chevron-down" size={16} color="#6b7280" />
                          </TouchableOpacity>
                        </View>

                        {fiskalyEnvironment === "LIVE" ? (
                          <View style={{ gap: 10 }}>
                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.apiBaseUrl")}</Text>
                              <TextInput
                                style={styles.fiskalyInput}
                                value={fiskalyApiBaseUrl}
                                onChangeText={setFiskalyApiBaseUrl}
                                placeholder={t("admin.organizations.fiskaly.placeholders.apiBaseUrl")}
                                placeholderTextColor="#6B7280"
                                autoCapitalize="none"
                              />
                            </View>

                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>
                                {t("admin.organizations.fiskaly.managedOrganizationId")}
                              </Text>
                              <TextInput
                                style={styles.fiskalyInput}
                                value={fiskalyManagedOrganizationId}
                                onChangeText={setFiskalyManagedOrganizationId}
                                placeholder={t(
                                  "admin.organizations.fiskaly.placeholders.managedOrganizationId"
                                )}
                                placeholderTextColor="#6B7280"
                                autoCapitalize="none"
                              />
                            </View>

                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.clientId")}</Text>
                              <TextInput
                                style={styles.fiskalyInput}
                                value={fiskalyClientId}
                                onChangeText={setFiskalyClientId}
                                placeholder={t("admin.organizations.fiskaly.placeholders.clientId")}
                                placeholderTextColor="#6B7280"
                                autoCapitalize="none"
                              />
                            </View>

                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.clientSecret")}</Text>
                              <TextInput
                                style={styles.fiskalyInput}
                                value={fiskalyClientSecret}
                                onChangeText={setFiskalyClientSecret}
                                placeholder={t("admin.organizations.fiskaly.placeholders.clientSecret")}
                                placeholderTextColor="#6B7280"
                                autoCapitalize="none"
                                secureTextEntry
                              />
                            </View>

                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.tssId")}</Text>
                              <TextInput
                                style={[styles.fiskalyInput, { opacity: 0.8 }]}
                                value={fiskalyTssId}
                                editable={false}
                                placeholder={t("admin.organizations.fiskaly.placeholders.tssId")}
                                placeholderTextColor="#6B7280"
                              />
                            </View>

                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.provisioningStatus")}</Text>
                              <TextInput
                                style={[styles.fiskalyInput, { opacity: 0.8 }]}
                                value={fiskalyProvisioningStatus}
                                editable={false}
                                placeholder={t("admin.organizations.fiskaly.placeholders.provisioningStatus")}
                                placeholderTextColor="#6B7280"
                              />
                            </View>

                            {/* German Tax Information (DSFinV-K) */}
                            <View style={styles.fiskalySectionDivider} />
                            <Text style={styles.fiskalySectionTitle}>{t("admin.organizations.fiskaly.taxInfo.sectionTitle")}</Text>

                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.taxInfo.taxNumber")}</Text>
                              <TextInput
                                style={styles.fiskalyInput}
                                value={taxNumber}
                                onChangeText={setTaxNumber}
                                placeholder={t("admin.organizations.fiskaly.taxInfo.taxNumberPlaceholder")}
                                placeholderTextColor="#6B7280"
                                autoCapitalize="none"
                              />
                            </View>

                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.taxInfo.vatId")}</Text>
                              <TextInput
                                style={styles.fiskalyInput}
                                value={vatId}
                                onChangeText={setVatId}
                                placeholder={t("admin.organizations.fiskaly.taxInfo.vatIdPlaceholder")}
                                placeholderTextColor="#6B7280"
                                autoCapitalize="none"
                              />
                            </View>

                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.taxInfo.fiscalName")}</Text>
                              <TextInput
                                style={styles.fiskalyInput}
                                value={fiscalName}
                                onChangeText={setFiscalName}
                                placeholder={t("admin.organizations.fiskaly.taxInfo.fiscalNamePlaceholder")}
                                placeholderTextColor="#6B7280"
                              />
                            </View>

                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.taxInfo.fiscalStreet")}</Text>
                              <TextInput
                                style={styles.fiskalyInput}
                                value={fiscalStreet}
                                onChangeText={setFiscalStreet}
                                placeholder={t("admin.organizations.fiskaly.taxInfo.fiscalStreetPlaceholder")}
                                placeholderTextColor="#6B7280"
                              />
                            </View>

                            <View style={styles.fiskalyFieldRow}>
                              <View style={[styles.fiskalyField, { flex: 1, marginRight: 8 }]}>
                                <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.taxInfo.fiscalZip")}</Text>
                                <TextInput
                                  style={styles.fiskalyInput}
                                  value={fiscalZip}
                                  onChangeText={setFiscalZip}
                                  placeholder={t("admin.organizations.fiskaly.taxInfo.fiscalZipPlaceholder")}
                                  placeholderTextColor="#6B7280"
                                  keyboardType="numeric"
                                />
                              </View>
                              <View style={[styles.fiskalyField, { flex: 2 }]}>
                                <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.taxInfo.fiscalCity")}</Text>
                                <TextInput
                                  style={styles.fiskalyInput}
                                  value={fiscalCity}
                                  onChangeText={setFiscalCity}
                                  placeholder={t("admin.organizations.fiskaly.taxInfo.fiscalCityPlaceholder")}
                                  placeholderTextColor="#6B7280"
                                />
                              </View>
                            </View>

                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.taxInfo.fiscalCountry")}</Text>
                              <TextInput
                                style={styles.fiskalyInput}
                                value={fiscalCountry}
                                onChangeText={setFiscalCountry}
                                placeholder={t("admin.organizations.fiskaly.taxInfo.fiscalCountryPlaceholder")}
                                placeholderTextColor="#6B7280"
                                autoCapitalize="characters"
                                maxLength={3}
                              />
                            </View>

                            {/* Save Tax Info to Fiskaly Button - only show when Fiskaly is configured */}
                            {fiskalyEnabled && fiskalyEnvironment === "LIVE" && fiskalyManagedOrganizationId && (
                              <View style={{ marginTop: 8, marginBottom: 8 }}>
                                {/* Inline feedback message */}
                                {saveTaxInfoMessage && (
                                  <View
                                    style={{
                                      backgroundColor: saveTaxInfoMessage.type === "success" ? "#dcfce7" : "#fecaca",
                                      padding: 10,
                                      borderRadius: 8,
                                      marginBottom: 8,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: saveTaxInfoMessage.type === "success" ? "#6EE7B7" : "#FCA5A5",
                                        fontSize: 13,
                                        textAlign: "center",
                                        fontWeight: "600",
                                      }}
                                    >
                                      {saveTaxInfoMessage.text}
                                    </Text>
                                  </View>
                                )}
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                <TouchableOpacity
                                  style={[
                                    styles.primaryButton,
                                    styles.fiskalySaveButton,
                                    { flex: 1 },
                                    saveTaxInfoLoading && styles.primaryButtonDisabled,
                                  ]}
                                  onPress={async () => {
                                    if (!fiskalyOrg) {
                                      const msg = "❌ No organization selected";
                                      setSaveTaxInfoMessage({ text: msg, type: "error" });
                                      setToast({
                                        visible: true,
                                        message: msg,
                                        type: "error",
                                      });
                                      return;
                                    }
                                    
                                    // Validate inputs
                                    if (!taxNumber.trim()) {
                                      const msg = t("admin.organizations.fiskaly.taxInfo.taxNumberRequired") || "❌ Tax number is required";
                                      setSaveTaxInfoMessage({ text: msg, type: "error" });
                                      setToast({
                                        visible: true,
                                        message: msg,
                                        type: "error",
                                      });
                                      return;
                                    }
                                    if (!vatId.trim()) {
                                      const msg = t("admin.organizations.fiskaly.taxInfo.vatIdRequired") || "❌ VAT ID is required";
                                      setSaveTaxInfoMessage({ text: msg, type: "error" });
                                      setToast({
                                        visible: true,
                                        message: msg,
                                        type: "error",
                                      });
                                      return;
                                    }
                                    
                                    try {
                                      setSaveTaxInfoLoading(true);
                                      setSaveTaxInfoMessage(null); // Clear previous message
                                      const token = await getToken();
                                      if (!token) {
                                        const msg = "❌ Authentication failed. Please log in again.";
                                        setSaveTaxInfoMessage({ text: msg, type: "error" });
                                        setToast({
                                          visible: true,
                                          message: msg,
                                          type: "error",
                                        });
                                        setSaveTaxInfoLoading(false);
                                        return;
                                      }
                                      
                                      const result = await branchService.updateFiskalyTaxInfo(
                                        fiskalyOrg.id,
                                        taxNumber.trim(),
                                        vatId.trim(),
                                        token,
                                        {
                                          fiscalName: fiscalName.trim(),
                                          fiscalStreet: fiscalStreet.trim(),
                                          fiscalZip: fiscalZip.trim(),
                                          fiscalCity: fiscalCity.trim(),
                                          fiscalCountry: fiscalCountry.trim(),
                                        }
                                      );
                                      
                                      if (!result || !result.success) {
                                        // Backend error responses use 'error' field, not 'message'
                                        const backendError = result?.error || result?.message || "❌ Failed to save tax info to Fiskaly";
                                        setSaveTaxInfoMessage({ text: backendError, type: "error" });
                                        setToast({
                                          visible: true,
                                          message: backendError,
                                          type: "error",
                                        });
                                        return;
                                      }
                                      
                                      const data = result?.data;
                                      const results = data?.results || [];
                                      const successCount = results.filter((r: any) => r.success).length;
                                      const failureCount = results.length - successCount;
                                      
                                      if (failureCount > 0) {
                                        // Partial success - show warning
                                        const failedDevices = results
                                          .filter((r: any) => !r.success)
                                          .map((r: any) => r.deviceName)
                                          .join(", ");
                                        const msg = `⚠️ Updated ${successCount} of ${results.length} devices. Failed: ${failedDevices}`;
                                        setSaveTaxInfoMessage({ text: msg, type: "error" });
                                        setToast({
                                          visible: true,
                                          message: msg,
                                          type: "error",
                                        });
                                      } else if (successCount > 0) {
                                        // Full success
                                        const msg = `✅ Tax info saved to Fiskaly (${successCount} device${successCount > 1 ? 's' : ''})`;
                                        setSaveTaxInfoMessage({ text: msg, type: "success" });
                                        setToast({
                                          visible: true,
                                          message: msg,
                                          type: "success",
                                        });
                                      } else {
                                        // No devices
                                        const msg = "❌ No devices updated. Check Fiskaly configuration.";
                                        setSaveTaxInfoMessage({ text: msg, type: "error" });
                                        setToast({
                                          visible: true,
                                          message: msg,
                                          type: "error",
                                        });
                                      }
                                    } catch (e: any) {
                                      // API errors have the backend error in e?.data?.error
                                      const backendError = e?.data?.error || e?.error || "";
                                      const errorMsg = backendError || e?.message || "";
                                      
                                      // Handle specific error codes with user-friendly messages
                                      if (errorMsg.includes("NO_PROVISIONED_DEVICES")) {
                                        const msg = "❌ No provisioned POS devices found. Please provision a device first.";
                                        setSaveTaxInfoMessage({ text: msg, type: "error" });
                                        setToast({
                                          visible: true,
                                          message: msg,
                                          type: "error",
                                        });
                                      } else if (errorMsg.includes("404") || errorMsg.includes("not found")) {
                                        const msg = "❌ Fiskaly cash register not found. Please check Fiskaly setup.";
                                        setSaveTaxInfoMessage({ text: msg, type: "error" });
                                        setToast({
                                          visible: true,
                                          message: msg,
                                          type: "error",
                                        });
                                      } else if (backendError) {
                                        // Show the exact backend error message
                                        const msg = `❌ ${backendError}`;
                                        setSaveTaxInfoMessage({ text: msg, type: "error" });
                                        setToast({
                                          visible: true,
                                          message: msg,
                                          type: "error",
                                        });
                                      } else {
                                        const msg = e?.message || t("admin.organizations.fiskaly.taxInfo.saveError");
                                        setSaveTaxInfoMessage({ text: msg, type: "error" });
                                        setToast({
                                          visible: true,
                                          message: msg,
                                          type: "error",
                                        });
                                      }
                                    } finally {
                                      setSaveTaxInfoLoading(false);
                                    }
                                  }}
                                  disabled={saveTaxInfoLoading}
                                >
                                  {saveTaxInfoLoading ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                  ) : (
                                    <>
                                      <MaterialCommunityIcons name="content-save" size={16} color="#fff" />
                                      <Text style={styles.primaryButtonText}>
                                        {t("admin.organizations.fiskaly.taxInfo.saveToFiskaly")}
                                      </Text>
                                    </>
                                  )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={[
                                    styles.secondaryButton,
                                    { flex: 1 },
                                    verifyTaxInfoLoading && styles.primaryButtonDisabled,
                                  ]}
                                  onPress={async () => {
                                    if (!fiskalyOrg) return;
                                    
                                    try {
                                      setVerifyTaxInfoLoading(true);
                                      const token = await getToken();
                                      if (!token) return;
                                      
                                      const result = await branchService.verifyFiskalyTaxInfo(
                                        fiskalyOrg.id,
                                        token
                                      );
                                      
                                      setTaxInfoVerifyData(result?.data || null);
                                      setTaxInfoVerifyModalOpen(true);
                                    } catch (e: any) {
                                      console.error("[TaxInfo Verify] Error:", e);
                                      setToast({
                                        visible: true,
                                        message: e?.message || "Failed to verify tax info",
                                        type: "error",
                                      });
                                    } finally {
                                      setVerifyTaxInfoLoading(false);
                                    }
                                  }}
                                  disabled={verifyTaxInfoLoading}
                                >
                                  {verifyTaxInfoLoading ? (
                                    <ActivityIndicator size="small" color="#6B7280" />
                                  ) : (
                                    <>
                                      <MaterialCommunityIcons name="check-circle" size={16} color="#6B7280" />
                                      <Text style={styles.secondaryButtonText}>
                                        {t("admin.organizations.fiskaly.taxInfo.verifyInFiskaly")}
                                      </Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              </View>
                              </View>
                            )}

                            <View style={styles.fiskalyField}>
                              <Text style={styles.fiskalyFieldLabel}>{t("admin.organizations.fiskaly.lastError")}</Text>
                              <TextInput
                                style={[styles.fiskalyInput, { opacity: 0.8 }]}
                                value={fiskalyProvisioningLastError}
                                editable={false}
                                placeholder={t("admin.organizations.fiskaly.placeholders.lastError")}
                                placeholderTextColor="#6B7280"
                              />
                            </View>
                          </View>
                        ) : null}
                      </>
                    )}

                    <View style={styles.fiskalyActionRow}>
                      <TouchableOpacity
                        style={[styles.secondaryButton, fiskalySaving && styles.primaryButtonDisabled]}
                        onPress={() => {
                          setFiskalyDialogOpen(false);
                          setFiskalyOrg(null);
                        }}
                        disabled={fiskalySaving}
                      >
                        <Text style={styles.secondaryButtonText}>
                          {t("common.close")}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.primaryButton,
                          styles.fiskalySaveButton,
                          fiskalySaving && styles.primaryButtonDisabled,
                        ]}
                        onPress={async () => {
                          if (!fiskalyOrg) return;
                          try {
                            setFiskalySaving(true);
                            const token = await getToken();
                            if (!token) return;
                            const payload: Partial<NonNullable<OrganizationSettings>> = {
                              fiskalyEnabled,
                              fiskalyEnvironment,
                              ...(fiskalyEnvironment === "LIVE"
                                ? {
                                    fiskalyManagedOrganizationId:
                                      fiskalyManagedOrganizationId.trim() || null,
                                    fiskalyApiBaseUrl: fiskalyApiBaseUrl.trim(),
                                    fiskalyClientId: fiskalyClientId.trim(),
                                    fiskalyClientSecret: fiskalyClientSecret,
                                  }
                                : {}),
                              // German Tax Information for DSFinV-K
                              taxNumber: taxNumber.trim() || null,
                              vatId: vatId.trim() || null,
                              fiscalName: fiscalName.trim() || null,
                              fiscalStreet: fiscalStreet.trim() || null,
                              fiscalZip: fiscalZip.trim() || null,
                              fiscalCity: fiscalCity.trim() || null,
                              fiscalCountry: fiscalCountry.trim() || "DEU",
                            };
                            await branchService.upsertOrganizationSettings(
                              fiskalyOrg.id,
                              payload as any,
                              token
                            );

                            const refreshed = await branchService.getOrganizationSettings(
                              fiskalyOrg.id,
                              token
                            );
                            setFiskalyTssId(String((refreshed as any)?.fiskalyTssId || ""));
                            setFiskalyProvisioningStatus(
                              String((refreshed as any)?.fiskalyProvisioningStatus || "")
                            );
                            const lastCode = String(
                              (refreshed as any)?.fiskalyProvisioningLastErrorCode || ""
                            );
                            const lastMsg = String(
                              (refreshed as any)?.fiskalyProvisioningLastErrorMessage || ""
                            );
                            setFiskalyProvisioningLastError(
                              [lastCode, lastMsg].filter(Boolean).join(": ")
                            );

                            setToast({
                              visible: true,
                              message: t("common.saved"),
                              type: "success",
                            });
                            setFiskalyDialogOpen(false);
                          } catch (e: any) {
                            setToast({
                              visible: true,
                              message: e?.message || t("common.error"),
                              type: "error",
                            });
                          } finally {
                            setFiskalySaving(false);
                          }
                        }}
                        disabled={fiskalySaving}
                      >
                        {fiskalySaving ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.primaryButtonText}>
                            {t("common.save")}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>

                    {fiskalyEnabled && fiskalyEnvironment === "LIVE" && (
                      <>
                        <View style={styles.fiskalyActionsRow}>
                          <TouchableOpacity
                            style={[
                              styles.toggleFiskalyButton,
                              fiskalyEnabled ? styles.toggleFiskalyButtonDisable : styles.toggleFiskalyButtonEnable,
                              fiskalySaving && styles.primaryButtonDisabled,
                              styles.fiskalyActionButton
                            ]}
                            onPress={async () => {
                              if (!fiskalyOrg) return;
                              if (fiskalyEnabled) {
                                // Disabling: show confirmation
                                setToggleFiskalyConfirmOpen(true);
                              } else {
                                // Enabling: immediate action
                                try {
                                  setToggleFiskalyLoading(true);
                                  const token = await getToken();
                                  if (!token) return;
                                  const resp = await branchService.toggleFiskalyForOrganization(fiskalyOrg.id, token);
                                  const nextEnabled = (resp as any)?.data?.fiskalyEnabled ?? false;
                                  setFiskalyEnabled(nextEnabled);
                                  setToast({
                                    visible: true,
                                    message: t("admin.organizations.fiskaly.toggle.enabled"),
                                    type: "success",
                                  });
                                } catch (e: any) {
                                  const code = String(e?.data?.code || "");
                                  if (code === "FISKALY_TSS_PERMANENTLY_DISABLED") {
                                    setFiskalyPermanentlyDisabledOpen(true);
                                    return;
                                  }
                                  setToast({
                                    visible: true,
                                    message: e?.message || t("common.error"),
                                    type: "error",
                                  });
                                } finally {
                                  setToggleFiskalyLoading(false);
                                }
                              }
                            }}
                            disabled={fiskalySaving || toggleFiskalyLoading}
                          >
                            {toggleFiskalyLoading && !fiskalyEnabled ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={styles.toggleFiskalyButtonText}>
                                {fiskalyEnabled
                                  ? t("admin.organizations.fiskaly.toggle.disable")
                                  : t("admin.organizations.fiskaly.toggle.enable")}
                              </Text>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.rotateFiskalyButton,
                              fiskalySaving && styles.primaryButtonDisabled,
                              styles.fiskalyActionButton
                            ]}
                            onPress={() => setRotateFiskalyConfirmOpen(true)}
                            disabled={fiskalySaving}
                          >
                            <Text style={styles.rotateFiskalyButtonText}>
                              {t("admin.organizations.fiskaly.rotate.button")}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* Fiskaly verification status display */}
                        {fiskalyVerificationStatus && (
                          <View style={styles.fiskalyStatusContainer}>
                            <Text style={styles.fiskalyStatusLabel}>
                              {t("admin.organizations.fiskaly.status.label")}:{" "}
                              <Text style={[
                                styles.fiskalyStatusValue,
                                { color: 
                                  fiskalyVerificationStatus.status === "ACTIVE" ? "#16a34a" : 
                                  fiskalyVerificationStatus.status === "INACTIVE" ? "#dc2626" : 
                                  fiskalyVerificationStatus.status === "CREDENTIALS_MISSING" ? "#f59e0b" :
                                  fiskalyVerificationStatus.status === "CREDENTIALS_INVALID" ? "#dc2626" :
                                  fiskalyVerificationStatus.status === "NOT_CONFIGURED" ? "#f59e0b" :
                                  fiskalyVerificationStatus.status === "TSS_NOT_FOUND" ? "#dc2626" :
                                  "#6b7280"
                                }
                              ]}>
                                {fiskalyVerificationStatus.status || "Unknown"}
                              </Text>
                            </Text>
                            {fiskalyVerificationStatus.message && (
                              <Text style={styles.fiskalyStatusDetail}>
                                {fiskalyVerificationStatus.message}
                              </Text>
                            )}
                            {fiskalyVerificationStatus.state && (
                              <Text style={styles.fiskalyStatusDetail}>
                                {t("admin.organizations.fiskaly.status.state")}: {fiskalyVerificationStatus.state}
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Verify status button */}
                        <TouchableOpacity
                          style={[styles.verifyButton, fiskalyVerificationLoading && styles.primaryButtonDisabled]}
                          onPress={async () => {
                            if (!fiskalyOrg) {
                              return;
                            }
                            try {
                              setFiskalyVerificationLoading(true);
                              const token = await getToken();
                              if (!token) {
                                return;
                              }
                              const resp = await branchService.verifyFiskalyStatus(fiskalyOrg.id, token);
                              const data = (resp as any)?.data;
                              setFiskalyVerificationStatus(data);
                              setToast({
                                visible: true,
                                message: t("admin.organizations.fiskaly.verify.success"),
                                type: "success",
                              });
                            } catch (e: any) {
                              console.error("Verification error:", e);
                              console.error("Error details:", {
                                message: e?.message,
                                response: e?.response,
                                data: e?.response?.data,
                                status: e?.status
                              });
                              
                              const errorData = (e as any)?.response?.data || (e as any)?.data || {};
                              const status = errorData.status || "ERROR";
                              const message = errorData.message || e?.message || t("common.error");
                              
                              // Set verification status to show the error state
                              setFiskalyVerificationStatus({
                                success: false,
                                status,
                                message,
                              });
                              
                              // Show toast with appropriate message
                              let toastMessage = message;
                              let toastType: "error" | "info" = "error";
                              
                              if (status === "CREDENTIALS_MISSING") {
                                toastMessage = t("admin.organizations.fiskaly.verify.credentialsMissing");
                                toastType = "info";
                              } else if (status === "CREDENTIALS_INVALID") {
                                toastMessage = t("admin.organizations.fiskaly.verify.credentialsInvalid");
                              } else if (status === "NOT_CONFIGURED") {
                                toastMessage = t("admin.organizations.fiskaly.verify.notConfigured");
                                toastType = "info";
                              }
                              
                              setToast({
                                visible: true,
                                message: toastMessage,
                                type: toastType,
                              });
                            } finally {
                              setFiskalyVerificationLoading(false);
                            }
                          }}
                          disabled={fiskalyVerificationLoading}
                        >
                          <Text style={styles.verifyButtonText}>
                            {fiskalyVerificationLoading
                              ? t("admin.organizations.fiskaly.verify.loading")
                              : t("admin.organizations.fiskaly.verify.button")}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={toggleFiskalyConfirmOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setToggleFiskalyConfirmOpen(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>
              {t("admin.organizations.fiskaly.toggle.title")}
            </Text>
            <Text style={styles.confirmMessage}>
              {t("admin.organizations.fiskaly.toggle.message")}
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancel]}
                onPress={() => setToggleFiskalyConfirmOpen(false)}
                disabled={toggleFiskalyLoading}
              >
                <Text style={styles.confirmCancelText}>{t("admin.organizations.fiskaly.toggle.cancel")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmDisable]}
                onPress={async () => {
                  if (!fiskalyOrg) return;
                  try {
                    setToggleFiskalyLoading(true);
                    setToggleFiskalyAction("pause");
                    const token = await getToken();
                    if (!token) return;
                    const resp = await branchService.toggleFiskalyForOrganization(fiskalyOrg.id, token);
                    const nextEnabled = (resp as any)?.data?.fiskalyEnabled ?? false;
                    setFiskalyEnabled(nextEnabled);
                    setToast({
                      visible: true,
                      message: t("admin.organizations.fiskaly.toggle.disabled"),
                      type: "success",
                    });
                    setToggleFiskalyConfirmOpen(false);
                  } catch (e: any) {
                    setToast({
                      visible: true,
                      message: e?.message || t("common.error"),
                      type: "error",
                    });
                  } finally {
                    setToggleFiskalyLoading(false);
                    setToggleFiskalyAction(null);
                  }
                }}
                disabled={toggleFiskalyLoading}
              >
                {toggleFiskalyLoading && toggleFiskalyAction === "pause" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmDisableText}>
                    {t("admin.organizations.fiskaly.toggle.confirm")}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmDisable]}
                onPress={async () => {
                  if (!fiskalyOrg) return;
                  try {
                    setToggleFiskalyLoading(true);
                    setToggleFiskalyAction("permanent");
                    const token = await getToken();
                    if (!token) return;
                    const resp = await branchService.disableFiskalyTssPermanently(fiskalyOrg.id, token);
                    const nextEnabled = (resp as any)?.data?.fiskalyEnabled ?? false;
                    setFiskalyEnabled(nextEnabled);
                    setToast({
                      visible: true,
                      message: t("admin.organizations.fiskaly.toggle.disabled"),
                      type: "success",
                    });
                    setToggleFiskalyConfirmOpen(false);
                  } catch (e: any) {
                    setToast({
                      visible: true,
                      message: e?.message || t("common.error"),
                      type: "error",
                    });
                  } finally {
                    setToggleFiskalyLoading(false);
                    setToggleFiskalyAction(null);
                  }
                }}
                disabled={toggleFiskalyLoading}
              >
                {toggleFiskalyLoading && toggleFiskalyAction === "permanent" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmDisableText} numberOfLines={1}>
                    {t("admin.organizations.fiskaly.toggle.confirm")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={fiskalyEnvironmentSheetOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setFiskalyEnvironmentSheetOpen(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setFiskalyEnvironmentSheetOpen(false)}>
          <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              {(["TEST", "LIVE"] as FiskalyEnvironment[]).map((env) => (
                <TouchableOpacity
                  key={env}
                  style={styles.sheetItem}
                  onPress={() => {
                    setFiskalyEnvironment(env);
                    setFiskalyEnvironmentSheetOpen(false);
                  }}
                >
                  <Text style={styles.sheetItemText}>{env}</Text>
                  {env === fiskalyEnvironment ? (
                    <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                  ) : null}
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setFiskalyEnvironmentSheetOpen(false)}
              >
                <Text style={styles.sheetCancelText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ValidationDialog
        open={validationDialogOpen}
        onOpenChange={setValidationDialogOpen}
        organization={selectedOrgForValidation}
        mode={validationMode}
        existingValidation={existingValidation}
        onSuccess={async () => {
          await loadOrganizations();
        }}
      />

      {/* Tax Info Verification Modal */}
      <Modal
        visible={taxInfoVerifyModalOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          setTaxInfoVerifyModalOpen(false);
          setTaxInfoVerifyData(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setTaxInfoVerifyModalOpen(false);
            setTaxInfoVerifyData(null);
          }}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetHeaderTitle}>{t("admin.organizations.fiskaly.taxInfo.verification.title")}</Text>
              <TouchableOpacity
                style={styles.sheetCloseInline}
                onPress={() => {
                  setTaxInfoVerifyModalOpen(false);
                  setTaxInfoVerifyData(null);
                }}
              >
                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 16, gap: 12 }}>
              {/* Comparison Table */}
              <View style={{ backgroundColor: "#f9fafb", borderRadius: 8, padding: 12 }}>
                <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingBottom: 8, marginBottom: 8 }}>
                  <Text style={{ flex: 1, color: "#6b7280", fontSize: 12, fontWeight: "600" }}>{t("admin.organizations.fiskaly.taxInfo.verification.field")}</Text>
                  <Text style={{ flex: 1.5, color: "#6b7280", fontSize: 12, fontWeight: "600" }}>{t("admin.organizations.fiskaly.taxInfo.verification.local")}</Text>
                  <Text style={{ flex: 1.5, color: "#6b7280", fontSize: 12, fontWeight: "600" }}>{t("admin.organizations.fiskaly.taxInfo.verification.fiskaly")}</Text>
                  <Text style={{ width: 30, color: "#6b7280", fontSize: 12, fontWeight: "600" }}>✓</Text>
                </View>

                {/* Tax Number Row */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                  <Text style={{ flex: 1, color: "#4b5563", fontSize: 13 }}>{t("admin.organizations.fiskaly.taxInfo.verification.stnr")}</Text>
                  <Text style={{ flex: 1.5, color: "#4b5563", fontSize: 13 }}>{taxInfoVerifyData?.local?.taxNumber || "-"}</Text>
                  <Text style={{ flex: 1.5, color: "#4b5563", fontSize: 13 }}>{taxInfoVerifyData?.fiskaly?.tax_number || t("admin.organizations.fiskaly.taxInfo.verification.notSet")}</Text>
                  <Text style={{ width: 30, fontSize: 16 }}>
                    {taxInfoVerifyData?.match?.taxNumber ? "✅" : "❌"}
                  </Text>
                </View>

                {/* VAT ID Row */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                  <Text style={{ flex: 1, color: "#4b5563", fontSize: 13 }}>{t("admin.organizations.fiskaly.taxInfo.verification.ustid")}</Text>
                  <Text style={{ flex: 1.5, color: "#4b5563", fontSize: 13 }}>{taxInfoVerifyData?.local?.vatId || "-"}</Text>
                  <Text style={{ flex: 1.5, color: "#4b5563", fontSize: 13 }}>{taxInfoVerifyData?.fiskaly?.vat_id || t("admin.organizations.fiskaly.taxInfo.verification.notSet")}</Text>
                  <Text style={{ width: 30, fontSize: 16 }}>
                    {taxInfoVerifyData?.match?.vatId ? "✅" : "❌"}
                  </Text>
                </View>
              </View>

              {/* Status Message */}
              {taxInfoVerifyData?.notFound ? (
                <View style={{ backgroundColor: "#fef3c7", padding: 12, borderRadius: 8 }}>
                  <Text style={{ color: "#FCD34D", fontSize: 14, textAlign: "center" }}>
                    {t("admin.organizations.fiskaly.taxInfo.verification.notFound")}
                  </Text>
                </View>
              ) : taxInfoVerifyData?.match?.taxNumber && taxInfoVerifyData?.match?.vatId ? (
                <View style={{ backgroundColor: "#dcfce7", padding: 12, borderRadius: 8 }}>
                  <Text style={{ color: "#6EE7B7", fontSize: 14, textAlign: "center" }}>
                    {t("admin.organizations.fiskaly.taxInfo.verification.matchSuccess")}
                  </Text>
                </View>
              ) : (
                <View style={{ backgroundColor: "#fecaca", padding: 12, borderRadius: 8 }}>
                  <Text style={{ color: "#FCA5A5", fontSize: 14, textAlign: "center" }}>
                    {t("admin.organizations.fiskaly.taxInfo.verification.mismatch")}
                  </Text>
                </View>
              )}

              {/* Raw Data for Debugging */}
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: "#6b7280", fontSize: 11, marginBottom: 4 }}>{t("admin.organizations.fiskaly.taxInfo.verification.rawResponse")}:</Text>
                <Text style={{ color: "#6b7280", fontSize: 10, fontFamily: "monospace" }}>
                  {JSON.stringify(taxInfoVerifyData?.fiskaly, null, 2)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, { marginTop: 16, justifyContent: 'center' }]}
              onPress={() => {
                setTaxInfoVerifyModalOpen(false);
                setTaxInfoVerifyData(null);
              }}
            >
              <Text style={[styles.primaryButtonText, { textAlign: 'center' }]}>{t("admin.organizations.fiskaly.taxInfo.verification.close")}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={unvalidateDialogOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          setUnvalidateDialogOpen(false);
          setSelectedOrgForUnvalidate(null);
          setSelectedValidationIdForUnvalidate(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setUnvalidateDialogOpen(false);
            setSelectedOrgForUnvalidate(null);
            setSelectedValidationIdForUnvalidate(null);
          }}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetHeaderTitle}>
                {t("admin.organizations.validation.temporarilyUnvalidate")}
              </Text>
              <TouchableOpacity
                style={styles.sheetCloseInline}
                onPress={() => {
                  setUnvalidateDialogOpen(false);
                  setSelectedOrgForUnvalidate(null);
                  setSelectedValidationIdForUnvalidate(null);
                }}
              >
                <MaterialCommunityIcons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetContent}>
              <Text style={styles.dialogSubtitle}>
                {(selectedOrgForUnvalidate?.name || selectedOrgForUnvalidate?.id || "").trim()}
              </Text>

              <Text style={styles.inlineLoadingText}>
                {t("admin.organizations.validation.temporarilyUnvalidateConfirm")}
              </Text>

              <View style={styles.sheetActionsRow}>
                <TouchableOpacity
                  style={styles.dialogButtonCancel}
                  onPress={() => {
                    setUnvalidateDialogOpen(false);
                    setSelectedOrgForUnvalidate(null);
                    setSelectedValidationIdForUnvalidate(null);
                  }}
                >
                  <Text style={styles.dialogButtonTextCancel}>{t("common.cancel")}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dialogButtonSave}
                  onPress={async () => {
                    const orgId = selectedOrgForUnvalidate?.id;
                    const validationId = selectedValidationIdForUnvalidate;
                    if (!orgId || !validationId) return;
                    try {
                      const token = await getToken();
                      if (!token) return;
                      await branchService.unvalidateValidation(orgId, validationId, token);
                      setToast({
                        visible: true,
                        message: t("admin.organizations.validation.temporarilyUnvalidated"),
                        type: "success",
                      });
                      setUnvalidateDialogOpen(false);
                      setSelectedOrgForUnvalidate(null);
                      setSelectedValidationIdForUnvalidate(null);
                      await loadOrganizations();
                    } catch (e: any) {
                      setToast({
                        visible: true,
                        message: e?.message || t("common.error"),
                        type: "error",
                      });
                    }
                  }}
                >
                  <Text style={styles.dialogButtonTextSave}>
                    {t("admin.organizations.validation.temporarilyUnvalidate")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={statusFilterSheetOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setStatusFilterSheetOpen(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setStatusFilterSheetOpen(false)}
        >
          <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              {(
                [
                  "all",
                  "validated",
                  "unvalidated",
                  "expired",
                  "grace_period",
                  "inactive",
                ] as const
              ).map((key) => {
                const label =
                  key === "all"
                    ? t("admin.organizations.validation.allStatuses")
                    : key === "validated"
                      ? t("admin.organizations.validation.validated")
                      : key === "unvalidated"
                        ? t("admin.organizations.validation.unvalidated")
                        : key === "expired"
                          ? t("admin.organizations.validation.expired")
                          : key === "grace_period"
                            ? t("admin.organizations.validation.gracePeriod")
                            : t("admin.organizations.inactive");

                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.sheetItem}
                    onPress={() => {
                      setStatusFilter(key);
                      setStatusFilterSheetOpen(false);
                    }}
                  >
                    <Text style={styles.sheetItemText}>{label}</Text>
                    {key === statusFilter ? (
                      <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setStatusFilterSheetOpen(false)}
              >
                <Text style={styles.sheetCancelText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollView: {
    flex: 1,
  },
  headerBlock: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  pageTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  pageDescription: {
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  cardTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  inlineLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 10,
  },
  inlineLoadingText: {
    color: "#6b7280",
    fontSize: 13,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 14,
  },
  orgCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
  },
  orgTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  orgNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  orgName: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
    maxWidth: "100%",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  statusPillActive: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderColor: "rgba(34, 197, 94, 0.25)",
  },
  statusPillInactive: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusPillTextActive: {
    color: "#22c55e",
  },
  statusPillTextInactive: {
    color: "#ef4444",
  },
  slugText: {
    marginTop: 6,
    color: "#6b7280",
    fontSize: 12,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  dialogTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
  },
  dialogClose: {
    padding: 4,
  },
  dialogSubtitle: {
    color: "#6b7280",
    fontSize: 13,
    marginBottom: 12,
  },
  kvRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  kvLabel: {
    color: "#4b5563",
    fontSize: 14,
    fontWeight: "600",
  },
  envButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  envButtonText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
  },
  fiskalyField: {
    gap: 6,
  },
  fiskalyFieldLabel: {
    color: "#4b5563",
    fontSize: 12,
    fontWeight: "600",
  },
  fiskalyInput: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    fontSize: 13,
  },
  fiskalySectionDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 16,
  },
  fiskalySectionTitle: {
    color: "#ec4899",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
  fiskalyFieldRow: {
    flexDirection: "row",
    gap: 8,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  fiskalyActionRow: {
    flexDirection: "row",
    gap: 12,
  },
  fiskalySaveButton: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  toggleFiskalyButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  toggleFiskalyButtonEnable: {
    backgroundColor: "#16a34a",
  },
  toggleFiskalyButtonDisable: {
    backgroundColor: "#dc2626",
  },
  toggleFiskalyButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  fiskalyActionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  fiskalyActionButton: {
    flex: 1,
    marginTop: 0,
  },
  confirmDisable: {
    backgroundColor: "#991b1b",
  },
  confirmDisableText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  confirmDecommission: {
    backgroundColor: "#dc2626",
  },
  confirmDecommissionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  confirmRecommission: {
    backgroundColor: "#059669",
  },
  confirmRecommissionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  
  decommissionButton: {
    flex: 1,
    backgroundColor: "#dc2626",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  decommissionButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  recommissionButton: {
    flex: 1,
    backgroundColor: "#059669",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  recommissionButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  verifyButton: {
    marginTop: 12,
    backgroundColor: "#4b5563",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  verifyButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  fiskalyStatusContainer: {
    marginTop: 12,
    padding: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  fiskalyStatusLabel: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "600",
  },
  fiskalyStatusValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  fiskalyStatusDetail: {
    fontSize: 11,
    color: "#334155",
    marginTop: 4,
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  confirmContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "92%",
    maxWidth: 520,
  },
  confirmTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  confirmMessage: {
    color: "#4b5563",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  confirmCancel: {
    backgroundColor: "#e5e7eb",
  },
  confirmCancelText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "700",
  },
  confirmReset: {
    backgroundColor: "#991b1b",
  },
  confirmResetText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  rotateFiskalyButton: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  rotateFiskalyButtonText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "700",
  },
  confirmRotate: {
    backgroundColor: "#dbeafe",
  },
  confirmRotateText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  sheetHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  sheetItemText: {
    color: "#4b5563",
    fontSize: 13,
    fontWeight: "600",
  },
  sheetCancel: {
    marginTop: 4,
    alignItems: "center",
    paddingVertical: 12,
  },
  sheetCancelText: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "600",
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  sheetHeaderTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  sheetCloseInline: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetScroll: {
    paddingHorizontal: 0,
  },
  sheetForm: {
    padding: 16,
    gap: 14,
  },
  sheetActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  dialogScrollView: {
    maxHeight: 520,
  },
  dialogForm: {
    padding: 16,
    gap: 14,
  },
  dialogField: {
    gap: 8,
  },
  dialogLabel: {
    color: "#4b5563",
    fontSize: 12,
    fontWeight: "600",
  },
  required: { color: "#ef4444" },
  dialogInput: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    fontSize: 13,
  },
  dialogInputDisabled: {
    opacity: 0.5,
    backgroundColor: "#e5e7eb",
  },
  entitlementsHeader: {
    marginTop: 4,
  },
  entitlementsHeaderText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  dialogSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switch: {
    width: 46,
    height: 26,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    padding: 3,
  },
  switchActive: {
    backgroundColor: "rgba(236, 72, 153, 0.2)",
  },
  switchDisabled: {
    opacity: 0.4,
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: "#9CA3AF",
  },
  switchThumbActive: {
    backgroundColor: "#ec4899",
    marginLeft: 20,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  dialogButtonCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "transparent",
  },
  dialogButtonTextCancel: {
    color: "#4b5563",
    fontSize: 13,
    fontWeight: "700",
  },
  dialogButtonSave: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#ec4899",
    minWidth: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogButtonTextSave: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  dialogButtonDisabled: {
    opacity: 0.5,
  },
  // Validation-related styles
  filtersSection: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    paddingVertical: 10,
  },
  statusFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  statusFilterText: {
    color: '#111827',
    fontSize: 14,
  },
  validationInfo: {
    marginTop: 8,
    gap: 4,
  },
  validationText: {
    fontSize: 11,
    color: '#6b7280',
  },
  gracePeriodText: {
    fontSize: 11,
    color: '#eab308',
  },
  branchCountText: {
    marginTop: 4,
    fontSize: 11,
    color: '#6b7280',
  },
  confirmationText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sheetItemSelected: {
    backgroundColor: 'rgba(236, 72, 153, 0.1)',
  },
  sheetItemTextSelected: {
    color: '#ec4899',
    fontWeight: '600',
  },
});
