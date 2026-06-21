import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { staffService, type StaffUser } from "@/src/services/staffService";
import { getAdminHeaderHeight } from "./_layout";
import { Toast } from "@/components/Toast";

export default function HireStaffScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken, userType, isLoading: authLoading } = useAuthRole();
  const { rbacUser, isLoading: permissionsLoading } = usePermissions();
  const { selectedOrganizationId, isLoading: orgLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + getAdminHeaderHeight();

  const viewerOrgRole = (rbacUser as any)?.orgRole as string | null | undefined;
  const canManageStaff =
    userType === "SUPER_ADMIN" || viewerOrgRole === "ORG_OWNER" || viewerOrgRole === "ORG_ADMIN";

  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidate, setCandidate] = useState<StaffUser | null>(null);
  const [hiring, setHiring] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const canSearch = useMemo(() => {
    if (!canManageStaff) return false;
    if (userType === "SUPER_ADMIN") {
      return Boolean(selectedOrganizationId) && !orgLoading;
    }
    return true;
  }, [canManageStaff, userType, selectedOrganizationId, orgLoading]);

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: "", type: "success" }), 3000);
  };

  const handleSearch = async () => {
    const q = email.trim();
    if (!q) return;

    try {
      setSearching(true);
      setCandidate(null);
      const token = await getToken();
      if (!token) return;

      const found = await staffService.searchHireCandidate(q, token);
      setCandidate(found);
    } catch (e: any) {
      const msg = e?.data?.error || e?.message || t("admin.staffManagement.hireSearchFailed", { defaultValue: "Failed to search user" });
      setCandidate(null);
      showToast("error", msg);
    } finally {
      setSearching(false);
    }
  };

  const handleHire = async () => {
    if (!candidate) return;

    try {
      setHiring(true);
      const token = await getToken();
      if (!token) return;

      await staffService.hireStaff(candidate.id, token);
      showToast("success", t("admin.staffManagement.hireSuccess", { defaultValue: "User hired successfully" }));
      router.back();
    } catch (e: any) {
      const raw = e?.data?.error || e?.message || "Failed to hire user";
      showToast("error", String(raw));
    } finally {
      setHiring(false);
    }
  };

  if (authLoading || permissionsLoading || !canManageStaff) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingTop: headerHeight - 8, paddingHorizontal: 16, paddingBottom: 24 }}>
        {userType === "SUPER_ADMIN" && !selectedOrganizationId ? (
          <View style={styles.noticeBox}>
            <MaterialCommunityIcons name="domain" size={18} color="#9CA3AF" />
            <Text style={styles.noticeText}>
              {t("admin.staffManagement.selectOrgFirst", { defaultValue: "Select an organization to hire staff." })}
            </Text>
          </View>
        ) : null}

        <Text style={styles.title}>
          {t("admin.staffManagement.hireStaff", { defaultValue: "Hire staff" })}
        </Text>
        <Text style={styles.subtitle}>
          {t("admin.staffManagement.hireStaffDescription", { defaultValue: "Search a user by email and hire them into the current organization." })}
        </Text>

        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <MaterialCommunityIcons name="email" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder={t("admin.staffManagement.hireEmailPlaceholder", { defaultValue: "Enter email" })}
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>
          <TouchableOpacity
            style={[styles.searchButton, (!canSearch || searching) && { opacity: 0.6 }]}
            onPress={handleSearch}
            disabled={!canSearch || searching}
          >
            {searching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.searchButtonText}>
                {t("common.search", { defaultValue: "Search" })}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {candidate ? (
          <View style={styles.card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {`${candidate.firstName || ""} ${candidate.lastName || ""}`.trim() || candidate.email}
                </Text>
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {candidate.email}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.hireButton, hiring && { opacity: 0.6 }]}
                onPress={handleHire}
                disabled={hiring}
              >
                {hiring ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.hireButtonText}>
                    {t("admin.staffManagement.hireConfirm", { defaultValue: "Hire" })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <Pressable style={{ height: 40 }} onPress={() => {}} />
      </ScrollView>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={() => setToast({ ...toast, visible: false })} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0b0b",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    marginTop: 8,
  },
  subtitle: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 18,
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#111111",
    marginBottom: 12,
  },
  noticeText: {
    flex: 1,
    color: "#D1D5DB",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  searchRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#111111",
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
  },
  searchButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ec4899",
    minWidth: 84,
    alignItems: "center",
  },
  searchButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  card: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#111111",
    padding: 14,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  cardSubtitle: {
    marginTop: 4,
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
  },
  hireButton: {
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  hireButtonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },
});
