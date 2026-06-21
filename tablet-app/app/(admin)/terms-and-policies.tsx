import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

type PolicyType =
  | "TERMS_OF_SERVICE"
  | "PRIVACY_POLICY"
  | "COOKIE_POLICY"
  | "REFUND_POLICY"
  | "DELIVERY_POLICY"
  | "DATA_PROTECTION_POLICY"
  | "USER_AGREEMENT"
  | "OTHER";

interface TermsAndPolicy {
  id: string;
  type: PolicyType;
  title: string;
  content: string;
  language: string;
  version: string;
  effectiveDate: string;
  isActive: boolean;
  isRequired: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    userConsents: number;
  };
}

// Policy types will be translated using t() function
const POLICY_TYPES: { value: PolicyType; label: string }[] = [
  { value: "TERMS_OF_SERVICE", label: "TERMS_OF_SERVICE" },
  { value: "PRIVACY_POLICY", label: "PRIVACY_POLICY" },
  { value: "COOKIE_POLICY", label: "COOKIE_POLICY" },
  { value: "REFUND_POLICY", label: "REFUND_POLICY" },
  { value: "DELIVERY_POLICY", label: "DELIVERY_POLICY" },
  { value: "DATA_PROTECTION_POLICY", label: "DATA_PROTECTION_POLICY" },
  { value: "USER_AGREEMENT", label: "USER_AGREEMENT" },
  { value: "OTHER", label: "OTHER" },
];

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
];

export default function TermsAndPoliciesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuthRole();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();

  const [policies, setPolicies] = useState<TermsAndPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<PolicyType | "">("");
  const [filterLanguage, setFilterLanguage] = useState<string>("");
  const [showFilterModal, setShowFilterModal] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  useEffect(() => {
    fetchPolicies();
  }, [filterType, filterLanguage]);

  // Refresh policies when returning from form page
  useFocusEffect(
    React.useCallback(() => {
      fetchPolicies();
    }, [filterType, filterLanguage])
  );

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

  const fetchPolicies = async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }
      const token = await getToken();
      const params = new URLSearchParams();
      if (filterType) params.append("type", filterType);
      if (filterLanguage) params.append("language", filterLanguage);

      const url = `${API_BASE_URL}/api/terms-and-policies${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        setPolicies(json.data);
      }
    } catch (e) {
      console.error("Error fetching policies:", e);
      setToast({
        visible: true,
        message: t("admin.termsAndPolicies.failedToFetch"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPolicies();
  };

  const handleCreateNew = () => {
    router.push("/(admin)/policy-form" as any);
  };

  const handleEdit = (policy: TermsAndPolicy) => {
    router.push(`/(admin)/policy-form?id=${policy.id}` as any);
  };

  const handleDelete = (policy: TermsAndPolicy) => {
    Alert.alert(
      t("admin.termsAndPolicies.deletePolicy"),
      t("admin.termsAndPolicies.deletePolicyConfirm", { title: policy.title, version: policy.version }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getToken();
              const res = await fetch(
                `${API_BASE_URL}/api/terms-and-policies/${policy.id}`,
                {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              if (!res.ok) {
                const json = await res.json();
                throw new Error(json.error || t("admin.termsAndPolicies.failedToDelete"));
              }
              setToast({
                visible: true,
                message: t("admin.termsAndPolicies.policyDeleted"),
                type: "success",
              });
              fetchPolicies();
            } catch (e: any) {
              setToast({
                visible: true,
                message: e.message || t("admin.termsAndPolicies.failedToDelete"),
                type: "error",
              });
            }
          },
        },
      ]
    );
  };


  const getPolicyTypeLabel = (type: PolicyType) => {
    const policyType = POLICY_TYPES.find((pt) => pt.value === type);
    if (policyType) {
      return t(`admin.termsAndPolicies.policyTypeLabels.${policyType.label}`) || type;
    }
    return type;
  };

  const getLanguageName = (code: string) => {
    return LANGUAGES.find((l) => l.code === code)?.name || code.toUpperCase();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 16 },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#f3f4f6"
          />
        }
      >
        <View style={styles.pageHeaderRow}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Terms & Policies</Text>
            <Text style={styles.pageDescription}>
              Manage terms of service, privacy policies, and other legal documents
            </Text>
          </View>
        </View>

        {/* Actions Row */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilterModal(true)}
          >
            <MaterialCommunityIcons name="filter-variant" size={20} color="#6b7280" />
            <Text style={styles.filterButtonText}>{t("admin.termsAndPolicies.filter")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateNew}
          >
            <MaterialCommunityIcons name="plus-circle" size={20} color="#fff" />
            <Text style={styles.createButtonText}>{t("admin.termsAndPolicies.newPolicy")}</Text>
          </TouchableOpacity>
        </View>

        {/* Active Filters */}
        {(filterType || filterLanguage) && (
          <View style={styles.activeFilters}>
            {filterType && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>
                  {t("admin.termsAndPolicies.type")}: {getPolicyTypeLabel(filterType as PolicyType)}
                </Text>
                <TouchableOpacity
                  onPress={() => setFilterType("")}
                  style={styles.filterChipClose}
                >
                  <MaterialCommunityIcons name="close" size={14} color="#111827" />
                </TouchableOpacity>
              </View>
            )}
            {filterLanguage && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>
                  {t("admin.termsAndPolicies.language")}: {getLanguageName(filterLanguage)}
                </Text>
                <TouchableOpacity
                  onPress={() => setFilterLanguage("")}
                  style={styles.filterChipClose}
                >
                  <MaterialCommunityIcons name="close" size={14} color="#111827" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Policies List */}
        {loading && policies.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>{t("admin.termsAndPolicies.loadingPolicies")}</Text>
          </View>
        ) : policies.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="file-document" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>{t("admin.termsAndPolicies.noPoliciesFound")}</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={handleCreateNew}
            >
              <Text style={styles.emptyButtonText}>{t("admin.termsAndPolicies.createFirstPolicy")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.policiesList}>
            {policies.map((policy) => (
              <View key={policy.id} style={styles.policyCard}>
                <View style={styles.policyHeader}>
                  <View style={styles.policyHeaderLeft}>
                    <Text style={styles.policyTitle}>{policy.title}</Text>
                    <View style={styles.policyMeta}>
                      <View style={styles.policyBadge}>
                        <Text style={styles.policyBadgeText}>
                          {getPolicyTypeLabel(policy.type)}
                        </Text>
                      </View>
                      <View style={styles.policyBadge}>
                        <Text style={styles.policyBadgeText}>
                          {getLanguageName(policy.language)}
                        </Text>
                      </View>
                      <Text style={styles.policyVersion}>v{policy.version}</Text>
                      {policy.isActive && (
                        <View style={styles.activeBadge}>
                          <Text style={styles.activeBadgeText}>{t("admin.termsAndPolicies.active")}</Text>
                        </View>
                      )}
                      {policy.isRequired && (
                        <View style={styles.requiredBadge}>
                          <Text style={styles.requiredBadgeText}>{t("admin.termsAndPolicies.required")}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.policyActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleEdit(policy)}
                    >
                      <EditIcon size={18} color="#111827" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.deleteButton]}
                      onPress={() => handleDelete(policy)}
                    >
                      <MaterialCommunityIcons name="delete" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.policyContent} numberOfLines={3}>
                  {policy.content}
                </Text>
                <View style={styles.policyFooter}>
                  <Text style={styles.policyDate}>
                    {t("admin.termsAndPolicies.effective")}: {new Date(policy.effectiveDate).toLocaleDateString()}
                  </Text>
                  {policy._count && policy._count.userConsents > 0 && (
                    <Text style={styles.consentCount}>
                      {policy._count.userConsents} {policy._count.userConsents === 1 ? t("admin.termsAndPolicies.consent") : t("admin.termsAndPolicies.consents")}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <Pressable
          style={styles.filterModalOverlay}
          onPress={() => setShowFilterModal(false)}
        >
          <Pressable style={styles.filterModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>{t("admin.termsAndPolicies.filter")}</Text>
              <TouchableOpacity
                onPress={() => setShowFilterModal(false)}
                style={styles.filterModalClose}
              >
                <MaterialCommunityIcons name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{t("admin.termsAndPolicies.type")}</Text>
            <View style={styles.filterOptions}>
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  !filterType && styles.filterOptionActive,
                ]}
                onPress={() => setFilterType("")}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    !filterType && styles.filterOptionTextActive,
                  ]}
                >
                  {t("admin.termsAndPolicies.allTypes")}
                </Text>
              </TouchableOpacity>
              {POLICY_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.filterOption,
                    filterType === type.value && styles.filterOptionActive,
                  ]}
                  onPress={() => setFilterType(type.value)}
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      filterType === type.value && styles.filterOptionTextActive,
                    ]}
                  >
                    {getPolicyTypeLabel(type.value)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>{t("admin.termsAndPolicies.language")}</Text>
            <View style={styles.filterOptions}>
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  !filterLanguage && styles.filterOptionActive,
                ]}
                onPress={() => setFilterLanguage("")}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    !filterLanguage && styles.filterOptionTextActive,
                  ]}
                >
                  {t("admin.termsAndPolicies.allLanguages")}
                </Text>
              </TouchableOpacity>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.filterOption,
                    filterLanguage === lang.code && styles.filterOptionActive,
                  ]}
                  onPress={() => setFilterLanguage(lang.code)}
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      filterLanguage === lang.code &&
                        styles.filterOptionTextActive,
                    ]}
                  >
                    {lang.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.applyFilterButton}
              onPress={() => {
                setShowFilterModal(false);
                fetchPolicies();
              }}
            >
              <Text style={styles.applyFilterButtonText}>{t("common.confirm")}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  pageHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
  },
  pageHeader: {
    flex: 1,
    minWidth: 0,
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
    color: "#6b7280",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    paddingTop: 16,
  },
  filterButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4b5563",
  },
  createButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ec4899",
    borderRadius: 8,
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  activeFilters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#ec4899",
    borderRadius: 16,
  },
  filterChipText: {
    fontSize: 12,
    color: "#fff",
  },
  filterChipClose: {
    padding: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6b7280",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    color: "#6b7280",
  },
  emptyButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#ec4899",
    borderRadius: 8,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  policiesList: {
    gap: 12,
  },
  policyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  policyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  policyHeaderLeft: {
    flex: 1,
  },
  policyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  policyMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  policyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  policyBadgeText: {
    fontSize: 12,
    color: "#4b5563",
  },
  policyVersion: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#4CAF50",
    borderRadius: 6,
  },
  activeBadgeText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  requiredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#FF9800",
    borderRadius: 6,
  },
  requiredBadgeText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  policyActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  actionButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    minWidth: 36,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButton: {
    backgroundColor: "#f3f4f6",
    borderColor: "#ef4444",
  },
  policyContent: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
    marginBottom: 12,
  },
  policyFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  policyDate: {
    fontSize: 12,
    color: "#6B7280",
  },
  consentCount: {
    fontSize: 12,
    color: "#ec4899",
    fontWeight: "600",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4b5563",
    marginBottom: 8,
    marginTop: 16,
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  filterModalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "80%",
  },
  filterModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  filterModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
  },
  filterModalClose: {
    padding: 4,
  },
  filterOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  filterOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterOptionActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  filterOptionText: {
    fontSize: 14,
    color: "#4b5563",
  },
  filterOptionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  applyFilterButton: {
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    alignItems: "center",
    marginTop: 8,
  },
  applyFilterButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});

