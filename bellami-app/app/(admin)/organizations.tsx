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
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import branchService, { type Organization } from "@/src/services/branchService";
import ValidationDialog from "@/components/admin/ValidationDialog";

export default function OrganizationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken, userType, isLoading: authLoading } = useAuthRole();
  const isSuperAdmin = userType === "SUPER_ADMIN";

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
  const [freeVersion, setFreeVersion] = useState<boolean>(false);

  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionsOrg, setActionsOrg] = useState<Organization | null>(null);

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
    } catch (error: any) {
      console.error("Failed to load organizations:", error);
      setToast({
        visible: true,
        message: error?.message || "Failed to load organizations",
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isSuperAdmin, getToken, refreshing, searchTerm, statusFilter]);

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
    getToken,
    loadOrganizations,
    maxActiveBranches,
    name,
    onlinePaymentsAllowed,
    paypalAllowed,
    reservationsAllowed,
    resetForm,
    t,
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
        message: error?.message || "Failed to load validation details",
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

    setSelectedOrgForValidation(org);
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
        message: error?.message || "Failed to reactivate validation",
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
        contentContainerStyle={{ paddingTop: headerHeight + 16, paddingBottom: 40 }}
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
              <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
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
                                defaultValue: "{{count}} branches",
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
                            <ActivityIndicator size="small" color="#9CA3AF" />
                          ) : (
                            <MaterialCommunityIcons name="dots-vertical" size={18} color="#9CA3AF" />
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
                  <MaterialCommunityIcons name="pencil" size={16} color="#D1D5DB" />
                  <Text style={styles.sheetItemText}>{t("admin.organizations.edit")}</Text>
                </TouchableOpacity>

                {isSuperAdmin && (
                  <>
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
                      <MaterialCommunityIcons name="calendar" size={16} color="#D1D5DB" />
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
                        <MaterialCommunityIcons name="pencil" size={16} color="#D1D5DB" />
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
                    color="#D1D5DB"
                  />
                  <Text style={styles.sheetItemText}>
                    {actionsOrg.isActive === false
                      ? t("admin.organizations.activate")
                      : t("admin.organizations.deactivate")
                    }
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
        visible={dialogOpen}
        transparent
        animationType="slide"
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
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.sheetKeyboardAvoid}
          >
            <Pressable
              style={styles.sheetContainer}
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
                  <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
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
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Validation Dialog */}
      <ValidationDialog
        open={validationDialogOpen}
        onOpenChange={setValidationDialogOpen}
        organization={selectedOrgForValidation}
        onSuccess={() => {
          loadOrganizations();
        }}
        mode={validationMode}
        existingValidation={existingValidation}
      />

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />

      {/* Status Filter Bottom Sheet */}
      <Modal
        visible={statusFilterSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setStatusFilterSheetOpen(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setStatusFilterSheetOpen(false)}
        >
          <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {t("admin.organizations.validation.filterByStatus")}
              </Text>
              <TouchableOpacity
                style={styles.sheetClose}
                onPress={() => setStatusFilterSheetOpen(false)}
              >
                <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.sheetContent}>
                {[
                  { value: "all", label: t("admin.organizations.validation.allStatuses") },
                  { value: "validated", label: t("admin.organizations.validation.validated") },
                  { value: "unvalidated", label: t("admin.organizations.validation.unvalidated") },
                  { value: "expired", label: t("admin.organizations.validation.expired") },
                  { value: "grace_period", label: t("admin.organizations.validation.gracePeriod") },
                  { value: "inactive", label: t("admin.organizations.inactive") },
                ].map((status) => (
                  <TouchableOpacity
                    key={status.value}
                    style={[
                      styles.sheetItem,
                      statusFilter === status.value && styles.sheetItemSelected,
                    ]}
                    onPress={() => {
                      setStatusFilter(status.value as any);
                      setStatusFilterSheetOpen(false);
                    }}
                  >
                    <Text style={[
                      styles.sheetItemText,
                      statusFilter === status.value && styles.sheetItemTextSelected
                    ]}>
                      {status.label}
                    </Text>
                    {statusFilter === status.value && (
                      <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  scrollView: { flex: 1 },
  headerBlock: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ec4899",
  },
  pageDescription: {
    marginTop: 4,
    fontSize: 12,
    color: "#9CA3AF",
  },
  card: {
    marginTop: 10,
    marginHorizontal: 16,
    backgroundColor: "#171717",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  cardTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  cardBody: {
    padding: 16,
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
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  inlineLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inlineLoadingText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  orgCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#0f0f0f",
  },
  orgTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  orgNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  orgName: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  slugText: {
    marginTop: 4,
    fontSize: 11,
    color: "#9CA3AF",
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillActive: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
  },
  statusPillInactive: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusPillTextActive: {
    color: "#22c55e",
  },
  statusPillTextInactive: {
    color: "#ef4444",
  },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "#262626",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheetKeyboardAvoid: {
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "#262626",
    paddingBottom: 10,
  },
  sheetHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#404040",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  sheetHeaderTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  sheetCloseInline: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "#262626",
  },
  sheetScroll: {
    maxHeight: 560,
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
    borderTopColor: "#262626",
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  // Additional bottom sheet styles for status filter
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  sheetTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "#262626",
  },
  sheetItemSelected: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  sheetItemTextSelected: {
    color: "#ec4899",
    fontWeight: "600",
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#0f0f0f",
  },
  sheetItemText: {
    color: "#D1D5DB",
    fontSize: 13,
    fontWeight: "600",
  },
  sheetCancel: {
    marginTop: 4,
    alignItems: "center",
    paddingVertical: 12,
  },
  sheetCancelText: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 16,
  },
  dialogContent: {
    backgroundColor: "#171717",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#262626",
    overflow: "hidden",
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  dialogTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  dialogCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "#262626",
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
    color: "#D1D5DB",
    fontSize: 12,
    fontWeight: "600",
  },
  required: { color: "#ef4444" },
  dialogInput: {
    backgroundColor: "#0f0f0f",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#262626",
    fontSize: 13,
  },
  dialogInputDisabled: {
    opacity: 0.5,
    backgroundColor: "#1a1a1a",
  },
  entitlementsHeader: {
    marginTop: 4,
  },
  entitlementsHeaderText: {
    color: "#fff",
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
    backgroundColor: "#262626",
    padding: 3,
  },
  switchActive: {
    backgroundColor: "rgba(236, 72, 153, 0.35)",
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
    borderTopColor: "#262626",
  },
  dialogButtonCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "transparent",
  },
  dialogButtonTextCancel: {
    color: "#D1D5DB",
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
  validationInfo: {
    marginTop: 8,
    gap: 4,
  },
  validationText: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  gracePeriodText: {
    fontSize: 11,
    color: "#f59e0b", // yellow-600
  },
  branchCountText: {
    marginTop: 4,
    fontSize: 11,
    color: "#9CA3AF",
  },
  // Filter styles
  filtersSection: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchIcon: {
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 2,
  },
  statusFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    minWidth: 100,
  },
  statusFilterText: {
    color: "#D1D5DB",
    fontSize: 14,
    fontWeight: "500",
  },
});
