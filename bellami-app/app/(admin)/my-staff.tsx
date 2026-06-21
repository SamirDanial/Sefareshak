import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { staffService, type StaffUser } from "@/src/services/staffService";
import branchService, { type Branch } from "@/src/services/branchService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import { getAvatarColor } from "@/src/utils/avatarColors";
import ApiService from "@/src/services/apiService";

const getUserDisplayName = (user: StaffUser): string => {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) {
    return user.firstName;
  }
  return user.email.split("@")[0];
};

const getUserInitials = (user: StaffUser): string => {
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  if (user.firstName) {
    return user.firstName[0].toUpperCase();
  }
  return user.email[0].toUpperCase();
};

export default function MyStaffScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken, userType, isLoading } = useAuthRole();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();

  const [loading, setLoading] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [allowedBranchIds, setAllowedBranchIds] = useState<string[]>([]);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);

  const [showBranchModal, setShowBranchModal] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "success",
  });

  const filteredStaff = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return staff.filter((u) => {
      if (!term) return true;
      const name = `${u.firstName || ""} ${u.lastName || ""}`
        .trim()
        .toLowerCase();
      const email = (u.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [staff, searchTerm]);

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

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();

      if (!token) {
        setBranches([]);
        setSelectedBranchId("");
        setAllowedBranchIds([]);
        return;
      }

      // Authoritative branch scope for BRANCH_ADMIN comes from RBAC (/api/permissions/me)
      const apiService = ApiService.getInstance();
      const permsResponse = await apiService.get("/api/permissions/me", token || undefined);
      const nextAllowed: string[] = Array.isArray(permsResponse?.data?.assignedBranchIds)
        ? permsResponse.data.assignedBranchIds
        : [];
      setAllowedBranchIds(nextAllowed);

      const fetchedBranches = await branchService.getBranches(token || undefined);
      const filteredBranches = nextAllowed.length
        ? fetchedBranches.filter((b) => nextAllowed.includes(b.id))
        : [];
      setBranches(filteredBranches);

      if (filteredBranches.length > 0) {
        setSelectedBranchId((prev) => {
          if (prev && filteredBranches.some((b) => b.id === prev)) return prev;
          return filteredBranches[0].id;
        });
      } else {
        setSelectedBranchId("");
      }
    } catch (e) {
      console.error("Error loading branches:", e);
      setToast({
        visible: true,
        message: t("admin.myStaff.loadBranchesError", {
          defaultValue: "Failed to load branches",
        }),
        type: "error",
      });
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (userType !== "BRANCH_ADMIN") {
      router.replace("/(admin)");
      return;
    }
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, userType]);

  const loadStaff = async () => {
    if (!selectedBranchId) return;
    if (allowedBranchIds.length > 0 && !allowedBranchIds.includes(selectedBranchId)) return;

    try {
      setLoading(true);
      const token = await getToken();
      const staffUsers = await staffService.getStaff(
        {
          branchId: selectedBranchId,
          includeInactive: false,
        },
        token || undefined
      );

      // Filter to show only staff types (not regular users)
      setStaff(staffUsers.filter((u) => u.userType !== "USER"));
    } catch (e) {
      console.error("Failed to load staff", e);
      setStaff([]);
      setToast({
        visible: true,
        message: t("admin.myStaff.loadStaffError", {
          defaultValue: "Failed to load staff",
        }),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedBranchId) {
      loadStaff();
    }
  }, [selectedBranchId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBranches();
    if (selectedBranchId) {
      await loadStaff();
    }
    setRefreshing(false);
  };

  if (loadingBranches && branches.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.myStaff.loadingBranches", {
              defaultValue: "Loading branches...",
            })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: headerHeight - 8 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#1f1f1f"
          />
        }
      >
        {/* Header with Icon */}
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderIcon}>
            <MaterialCommunityIcons
              name="account-supervisor"
              size={24}
              color="#ec4899"
            />
          </View>
          <View style={styles.pageHeaderText}>
            <Text style={styles.pageTitle}>
              {t("admin.myStaff.title", { defaultValue: "My Staff" })}
            </Text>
            <Text style={styles.pageSubtitle}>
              {t("admin.myStaff.description", {
                defaultValue: "View staff assigned to your branches.",
              })}
            </Text>
          </View>
        </View>

        {/* Filters */}
        <View style={styles.filtersContainer}>
          {/* Branch Selector */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>
              {t("admin.myStaff.branch", { defaultValue: "Branch" })}
            </Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => {
                if (branches.length > 1) setShowBranchModal(true);
              }}
              disabled={loadingBranches || branches.length <= 1}
            >
              <Text style={styles.selectButtonText}>
                {selectedBranchId
                  ? branches.find((b) => b.id === selectedBranchId)?.name ||
                    t("admin.myStaff.selectBranch", {
                      defaultValue: "Select branch",
                    })
                  : t("admin.myStaff.selectBranch", {
                      defaultValue: "Select branch",
                    })}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>
              {t("admin.myStaff.search", { defaultValue: "Search" })}
            </Text>
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder={t("admin.myStaff.searchPlaceholder", {
                  defaultValue: "Search by name or email",
                })}
                placeholderTextColor="#6B7280"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>
          </View>
        </View>

        {/* Staff List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>
              {t("admin.myStaff.loadingStaff", {
                defaultValue: "Loading staff...",
              })}
            </Text>
          </View>
        ) : filteredStaff.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="account-group"
              size={48}
              color="#6B7280"
            />
            <Text style={styles.emptyText}>
              {t("admin.myStaff.noStaffFound", {
                defaultValue: "No staff found.",
              })}
            </Text>
          </View>
        ) : (
          filteredStaff.map((user) => (
            <View key={user.id} style={styles.userCard}>
              <View style={styles.userCardContent}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: getAvatarColor(user.id) },
                  ]}
                >
                  <Text style={styles.avatarText}>{getUserInitials(user)}</Text>
                </View>
                <View style={styles.userDetails}>
                  <View style={styles.userNameRow}>
                    <Text style={styles.userName}>{getUserDisplayName(user)}</Text>
                    {user.userType === "SUPER_ADMIN" && (
                      <View style={styles.adminBadge}>
                        <MaterialCommunityIcons
                          name="shield-check"
                          size={10}
                          color="#fff"
                        />
                        <Text style={styles.adminBadgeText}>Super Admin</Text>
                      </View>
                    )}
                    {user.userType === "BRANCH_ADMIN" && (
                      <View style={[styles.adminBadge, styles.branchAdminBadge]}>
                        <MaterialCommunityIcons
                          name="shield"
                          size={10}
                          color="#fff"
                        />
                        <Text style={styles.adminBadgeText}>Branch Admin</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.userMetaRow}>
                    <View style={styles.userMetaItem}>
                      <MaterialCommunityIcons
                        name="email"
                        size={12}
                        color="#9CA3AF"
                      />
                      <Text style={styles.userMetaText} numberOfLines={1}>
                        {user.email}
                      </Text>
                    </View>
                  </View>
                  {user.phone && (
                    <View style={styles.userMetaRow}>
                      <View style={styles.userMetaItem}>
                        <MaterialCommunityIcons
                          name="phone"
                          size={12}
                          color="#9CA3AF"
                        />
                        <Text style={styles.userMetaText}>{user.phone}</Text>
                      </View>
                    </View>
                  )}
                  <View style={styles.userMetaRow}>
                    <View style={styles.userMetaItem}>
                      <MaterialCommunityIcons
                        name="account"
                        size={12}
                        color="#9CA3AF"
                      />
                      <Text style={styles.userMetaText}>{user.userType}</Text>
                    </View>
                  </View>
                  {user.userRoles && user.userRoles.length > 0 && (
                    <View style={styles.rolesContainer}>
                      {user.userRoles.map((ur, idx) => (
                        <View key={idx} style={styles.roleChip}>
                          <Text style={styles.roleChipText}>
                            {ur.role?.name || ur.roleId}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Branch Selection Modal */}
      <Modal
        visible={showBranchModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBranchModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBranchModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.myStaff.selectBranch", {
                  defaultValue: "Select Branch",
                })}
              </Text>
              <TouchableOpacity onPress={() => setShowBranchModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {branches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.bottomSheetOption,
                    selectedBranchId === b.id && styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedBranchId(b.id);
                    setShowBranchModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      selectedBranchId === b.id &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {b.name}
                  </Text>
                  {selectedBranchId === b.id && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color="#ec4899"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  pageHeaderIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  pageHeaderText: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ec4899",
  },
  pageSubtitle: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 2,
  },
  filtersContainer: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#262626",
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D1D5DB",
    marginBottom: 8,
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0f0f0f",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#262626",
  },
  selectButtonText: {
    fontSize: 14,
    color: "#D1D5DB",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f0f0f",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  userCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#262626",
  },
  userCardContent: {
    flexDirection: "row",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  userDetails: {
    flex: 1,
    gap: 6,
  },
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ec4899",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  branchAdminBadge: {
    backgroundColor: "#8b5cf6",
  },
  adminBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
  },
  userMetaRow: {
    flexDirection: "row",
    gap: 16,
  },
  userMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  userMetaText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  rolesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "rgba(236, 72, 153, 0.2)",
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ec4899",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  bottomSheetBody: {
    padding: 16,
  },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
  },
  bottomSheetOptionActive: {
    backgroundColor: "#1a1a1a",
    borderColor: "#ec4899",
  },
  bottomSheetOptionText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
});
