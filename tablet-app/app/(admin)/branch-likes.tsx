import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import branchService, { type Branch } from "@/src/services/branchService";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAvatarColor } from "@/src/utils/avatarColors";

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default function BranchLikesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();

  const { getToken, userType, isLoading: authLoading } = useAuthRole();
  const { isSuperAdmin: isSuperAdminFromPermissions, isOrgAdmin } = usePermissions();
  const { selectedOrganizationId } = useOrganization();
  const isSuperAdmin = userType === "SUPER_ADMIN" || isSuperAdminFromPermissions;
  const isAuthorized = isSuperAdmin || isOrgAdmin;

  const lastScrollY = useRef(0);
  const isTablet = width >= 768;

  const [likesData, setLikesData] = useState<any[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
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

  const isSearchingRef = useRef(false);
  const isInitialMount = useRef(true);

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

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthorized) {
      router.replace("/(admin)" as any);
    }
  }, [authLoading, isAuthorized, router]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadInitialData();
    }
  }, []);

  useEffect(() => {
    if (isInitialMount.current) return;

    isSearchingRef.current = true;
    setFilterLoading(true);
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      loadLikes().finally(() => {
        setFilterLoading(false);
        setTimeout(() => {
          isSearchingRef.current = false;
        }, 100);
      });
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      setFilterLoading(false);
    };
  }, [searchTerm]);

  useEffect(() => {
    if (isInitialMount.current) return;
    if (!isSearchingRef.current) {
      setFilterLoading(true);
      loadLikes().finally(() => setFilterLoading(false));
    }
  }, [currentPage, selectedBranchId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      if (!selectedOrganizationId) {
        // For super admins without selected organization, show empty state
        setBranches([]);
        setLikesData([]);
        setTotalPages(1);
        setTotalCount(0);
        return;
      }

      // Fetch organization branches to populate filter
      const activeBranches = await branchService.getBranches(token, {
        organizationId: selectedOrganizationId,
      });
      setBranches(activeBranches || []);

      await loadLikes(token);
    } catch (error) {
      console.error("Error loading initial data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLikes = async (customToken?: string) => {
    try {
      const token = customToken || (await getToken());
      if (!token) return;
      if (!selectedOrganizationId) {
        // For super admins without selected organization, show empty state
        setLikesData([]);
        setTotalPages(1);
        setTotalCount(0);
        return;
      }

      const response = await branchService.getOrganizationBranchLikes(
        selectedOrganizationId,
        currentPage,
        10,
        searchTerm.trim(),
        selectedBranchId || undefined,
        token
      );
      
      if (response && response.success) {
        setLikesData(response.data || []);
        setTotalPages(response.pagination.totalPages || 1);
        setTotalCount(response.pagination.totalCount || 0);
      }
    } catch (error) {
      console.error("Error loading branch likes:", error);
      setToast({
        visible: true,
        message: t("admin.branchLikes.loadError", { defaultValue: "Failed to load branch likes data" }),
        type: "error",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setCurrentPage(1);
    await loadInitialData();
  };

  const getInitials = (user: any) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.firstName) {
      return user.firstName[0].toUpperCase();
    }
    return (user.email || "B")[0].toUpperCase();
  };

  const getDisplayName = (user: any) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) {
      return user.firstName;
    }
    return user.email.split("@")[0];
  };

  if (authLoading || !isAuthorized) {
    return <View style={styles.container} />;
  }

  if (loading && likesData.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("admin.branchLikes.loading", { defaultValue: "Loading favorited branch data..." })}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
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
        <View style={styles.headerWrap}>
          <Text style={styles.headerTitle}>{t("admin.branchLikes.title", { defaultValue: "Branch Favorites" })}</Text>
          <TouchableOpacity onPress={() => setShowFilters((prev) => !prev)} style={styles.filterTextButtonContainer}>
            <Text style={styles.filterTextButton}>
              {showFilters
                ? t("admin.branchLikes.hideFilters", { defaultValue: "Hide Filters" })
                : t("admin.branchLikes.showFilters", { defaultValue: "Show Filters" })}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.headerSubtitle}>
          {t("admin.branchLikes.subtitle", { defaultValue: "View customers who favorited one or more of your organization's branches." })}
        </Text>

        <View style={{ paddingBottom: showFilters ? 4 : 16 }} />

        {showFilters && (
          <View style={styles.filtersContainer}>
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={16} color="#374151" />
              <TextInput
                style={styles.searchInput}
                placeholder={t("admin.branchLikes.searchPlaceholder", { defaultValue: "Search by customer name or email..." })}
                placeholderTextColor="#6B7280"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>

            <View style={styles.branchSelectorContainer}>
              <Text style={styles.branchSelectorLabel}>
                {t("admin.branchLikes.filterByBranch", { defaultValue: "Filter by Branch:" })}
              </Text>
              <TouchableOpacity
                style={styles.branchSelectorButton}
                onPress={() => setShowBranchModal(true)}
                disabled={filterLoading}
              >
                <Text
                  style={[
                    styles.branchSelectorText,
                    !selectedBranchId && styles.branchSelectorPlaceholder,
                  ]}
                >
                  {selectedBranchId
                    ? branches.find((b) => b.id === selectedBranchId)?.name ||
                      t("admin.branchLikes.allBranches", { defaultValue: "All Branches" })
                    : t("admin.branchLikes.allBranches", { defaultValue: "All Branches" })}
                </Text>
                {filterLoading ? (
                  <ActivityIndicator size="small" color="#ec4899" />
                ) : (
                  <MaterialCommunityIcons name="chevron-down" size={16} color="#374151" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {likesData.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="heart-broken-outline" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>{t("admin.branchLikes.noFavoritesFound", { defaultValue: "No customers found with favorited branches matching criteria." })}</Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {likesData.map((item) => (
              <View key={item.id} style={styles.userCard}>
                <View style={styles.userCardHeader}>
                  <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.id) }]}>
                    <Text style={styles.avatarText}>{getInitials(item)}</Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {getDisplayName(item)}
                    </Text>
                    <View style={styles.metaRow}>
                      <MaterialCommunityIcons name="email-outline" size={13} color="#374151" />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {item.email}
                      </Text>
                    </View>
                    {item.phone ? (
                      <View style={styles.metaRow}>
                        <MaterialCommunityIcons name="phone-outline" size={13} color="#374151" />
                        <Text style={styles.metaText}>{item.phone}</Text>
                      </View>
                    ) : null}
                    <View style={styles.metaRow}>
                      <MaterialCommunityIcons name="calendar-outline" size={13} color="#374151" />
                      <Text style={styles.metaText}>
                        {t("admin.branchLikes.registeredOn", { defaultValue: "Joined" })}: {formatDate(item.joinedAt)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.likedBranchesSection}>
                  <Text style={styles.likedSectionTitle}>
                    {t("admin.branchLikes.favoritedBranchesHeader", { defaultValue: "Favorited Branches:" })}
                  </Text>
                  <View style={styles.tagWrap}>
                    {item.likedBranches.map((bl: any) => (
                      <View key={bl.id} style={styles.branchTag}>
                        <MaterialCommunityIcons name="heart" size={11} color="#f43f5e" />
                        <Text style={styles.branchTagText}>{bl.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {totalPages > 1 && (
          <View style={styles.pagination}>
            <Text style={styles.paginationText}>
              {t("admin.branchLikes.showingFavorites", {
                defaultValue: "Showing {{count}} of {{total}} favorited entries",
                count: likesData.length,
                total: totalCount,
              })}
            </Text>
            <View style={styles.paginationButtons}>
              <TouchableOpacity
                style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
                onPress={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <MaterialCommunityIcons name="chevron-left" size={16} color="#111827" />
              </TouchableOpacity>
              <Text style={styles.paginationPageText}>
                {t("admin.branchLikes.pageOf", {
                  defaultValue: "Page {{current}} of {{total}}",
                  current: currentPage,
                  total: totalPages,
                })}
              </Text>
              <TouchableOpacity
                style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]}
                onPress={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <MaterialCommunityIcons name="chevron-right" size={16} color="#111827" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
        topOffset={16}
      />

      <RefreshSpinner visible={refreshing} topOffset={16} />

      {/* Branch Modal */}
      <Modal
        visible={showBranchModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowBranchModal(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setShowBranchModal(false)}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>
                {t("admin.branchLikes.filterByBranch", { defaultValue: "Filter by Branch:" })}
              </Text>

              <ScrollView style={styles.sheetScrollView}>
                <TouchableOpacity
                  style={[styles.sheetItem, !selectedBranchId && styles.sheetItemActive]}
                  onPress={() => {
                    setSelectedBranchId("");
                    setCurrentPage(1);
                    setShowBranchModal(false);
                  }}
                >
                  <Text style={[styles.sheetItemText, !selectedBranchId && styles.sheetItemTextActive]}>
                    {t("admin.branchLikes.allBranches", { defaultValue: "All Branches" })}
                  </Text>
                  {!selectedBranchId && (
                    <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                  )}
                </TouchableOpacity>
                {branches.map((branch) => (
                  <TouchableOpacity
                    key={branch.id}
                    style={[styles.sheetItem, selectedBranchId === branch.id && styles.sheetItemActive]}
                    onPress={() => {
                      setSelectedBranchId(branch.id);
                      setCurrentPage(1);
                      setShowBranchModal(false);
                    }}
                  >
                    <Text style={[styles.sheetItemText, selectedBranchId === branch.id && styles.sheetItemTextActive]}>
                      {branch.name || branch.code || branch.id}
                    </Text>
                    {selectedBranchId === branch.id && (
                      <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setShowBranchModal(false)}
              >
                <Text style={styles.sheetCancelText}>
                  {t("common.cancel") || "Cancel"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  headerWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#374151",
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#374151",
  },
  filterTextButtonContainer: {
    alignSelf: "flex-end",
  },
  filterTextButton: {
    color: "#ec4899",
    fontSize: 13,
    fontWeight: "600",
  },
  filtersContainer: {
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
  },
  branchSelectorContainer: {
    gap: 8,
  },
  branchSelectorLabel: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  branchSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  branchSelectorText: {
    fontSize: 14,
    color: "#111827",
  },
  branchSelectorPlaceholder: {
    color: "#6B7280",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginTop: 8,
    borderRadius: 2,
  },
  sheetContent: {
    padding: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  sheetScrollView: {
    maxHeight: 300,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetItemActive: {
    borderColor: "#ec4899",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#111827",
  },
  sheetItemTextActive: {
    color: "#111827",
    fontWeight: "600",
  },
  sheetCancel: {
    marginTop: 12,
    paddingVertical: 12,
    backgroundColor: "#e5e7eb",
    borderRadius: 10,
    alignItems: "center",
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  gridContainer: {
    gap: 16,
  },
  userCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
  },
  userCardHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: "#374151",
    flex: 1,
  },
  likedBranchesSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 12,
    gap: 6,
  },
  likedSectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  branchTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fdf2f8",
    borderColor: "#f43f5e",
    borderWidth: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  branchTagText: {
    color: "#f43f5e",
    fontSize: 11,
    fontWeight: "500",
  },
  emptyContainer: {
    padding: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 16,
  },
  paginationText: {
    fontSize: 12,
    color: "#6B7280",
  },
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  paginationButton: {
    backgroundColor: "#ffffff",
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationPageText: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
  },
});
