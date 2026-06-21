import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useRouter } from "expo-router";
import branchService, { type Organization } from "@/src/services/branchService";
import { userService, type OrgRole, type User, type UserType } from "@/src/services/userService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import { getAvatarColor } from "@/src/utils/avatarColors";

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getUserDisplayName = (user: User): string => {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) {
    return user.firstName;
  }
  return user.email.split("@")[0];
};

const getUserInitials = (user: User): string => {
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  if (user.firstName) {
    return user.firstName[0].toUpperCase();
  }
  return user.email[0].toUpperCase();
};

export default function UsersManagementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken, userType, isLoading: authLoading } = useAuthRole();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();

  const isSuperAdmin = userType === "SUPER_ADMIN";
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserType, setSelectedUserType] = useState<string>("");
  const [sortBy, setSortBy] = useState<"name" | "email" | "createdAt" | "userType">(
    "createdAt"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [orgDialogUser, setOrgDialogUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [editOrganizationId, setEditOrganizationId] = useState<string>("");
  const [editOrgRole, setEditOrgRole] = useState<OrgRole>("ORG_STAFF");
  const [orgSearchTerm, setOrgSearchTerm] = useState<string>("");
  const [showRoleFilterModal, setShowRoleFilterModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  };
  const [actionsUser, setActionsUser] = useState<User | null>(null);
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

  useEffect(() => {
    if (authLoading) return;
    if (!isSuperAdmin) {
      router.replace("/(admin)");
    }
  }, [authLoading, isSuperAdmin, router]);

  // Initial load on mount
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadData();
    }
  }, []);

  // Debounced search - resets to page 1 when search changes
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) return;

    isSearchingRef.current = true;
    const timeoutId = setTimeout(() => {
      // Reset to page 1 when search term changes
      setCurrentPage(1);
      loadData();
      // Reset flag after a short delay
      setTimeout(() => {
        isSearchingRef.current = false;
      }, 100);
    }, 500); // Increased debounce for better UX
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Load data when filters, sorting, or pagination change
  // Skip if search is currently being processed or initial mount
  useEffect(() => {
    if (isInitialMount.current) return;
    if (!isSearchingRef.current) {
      loadData();
    }
  }, [currentPage, selectedUserType, sortBy, sortOrder]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const token = await getToken();

      if (token && organizations.length === 0) {
        try {
          const orgs = await branchService.getOrganizations(token);
          setOrganizations(orgs);
        } catch {
        }
      }

      const response = await userService.getUsers(
        currentPage,
        10,
        searchTerm.trim(), // Send trimmed search term to backend
        sortBy,
        sortOrder,
        selectedUserType,
        token || undefined
      );

      setUsers(response.users);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error loading users:", error);
      Alert.alert("Error", t("admin.userManagement.loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const openOrgDialog = (user: User) => {
    setOrgDialogUser(user);
    setEditOrganizationId(user.organizationId || "");
    setEditOrgRole((user.orgRole as OrgRole) || "ORG_STAFF");
    setOrgSearchTerm("");
    setOrgDialogOpen(true);
    setActionsModalVisible(false);
  };

  const filteredOrganizations = React.useMemo(() => {
    const q = orgSearchTerm.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter((o) => {
      const name = String(o?.name || "").toLowerCase();
      const id = String(o?.id || "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [orgSearchTerm, organizations]);

  const saveOrgDialog = async () => {
    if (!orgDialogUser) return;
    try {
      setIsActionLoading(orgDialogUser.id);
      const token = await getToken();
      await userService.setUserOrganization(
        orgDialogUser.id,
        {
          organizationId: editOrganizationId ? editOrganizationId : null,
          orgRole: editOrganizationId ? editOrgRole : null,
        },
        token || undefined
      );
      setOrgDialogOpen(false);
      setOrgDialogUser(null);
      await loadData();
    } catch (error) {
      console.error("Error updating user organization:", error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleMakeOrdinaryUser = async (user: User) => {
    try {
      setIsActionLoading(user.id);
      setActionsModalVisible(false);
      const token = await getToken();
      await userService.setUserOrganization(
        user.id,
        { organizationId: null, orgRole: null },
        token || undefined
      );
      await loadData();
    } catch (error) {
      console.error("Error changing user to ordinary:", error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleUserTypeFilter = (userType: string) => {
    setSelectedUserType(userType === "all" ? "" : userType);
    setCurrentPage(1);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field as any);
      setSortOrder(field === "createdAt" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const handleSetUserType = async (user: User, userType: UserType) => {
    try {
      setIsActionLoading(user.id);
      setShowActionsMenu(null);
      const token = await getToken();
      await userService.setUserType(user.id, userType, token || undefined);
      await loadData();
      setToast({
        visible: true,
        message: t("admin.userManagement.updatedUserType", {
          defaultValue: "Updated user type",
        }),
        type: "success",
      });
    } catch (error) {
      console.error("Error updating user type:", error);
      setToast({
        visible: true,
        message: t("admin.userManagement.updateUserTypeError", {
          defaultValue: "Failed to update user type",
        }),
        type: "error",
      });
    } finally {
      setIsActionLoading(null);
    }
  };

  const getUserTypeLabel = (userType: UserType): string => {
    const map: Record<UserType, string> = {
      SUPER_ADMIN: "Super Admin",
      BRANCH_ADMIN: "Branch Admin",
      EMPLOYEE: "Employee",
      WAITER: "Waiter",
      USER: "User",
    };
    return map[userType] || userType;
  };

  const handleToggleStatus = async (user: User) => {
    try {
      setIsActionLoading(user.id);
      setShowActionsMenu(null);
      const token = await getToken();
      await userService.toggleUserStatus(user.id, token || undefined);
      await loadData();
      setToast({
        visible: true,
        message: user.isActive
          ? t("admin.userManagement.userDeactivated", {
              name: getUserDisplayName(user),
            })
          : t("admin.userManagement.userActivated", {
              name: getUserDisplayName(user),
            }),
        type: "success",
      });
    } catch (error) {
      console.error("Error toggling user status:", error);
      setToast({
        visible: true,
        message: t("admin.userManagement.toggleStatusError"),
        type: "error",
      });
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      setIsActionLoading(userToDelete.id);
      setShowDeleteModal(false);
      const token = await getToken();
      await userService.deleteUser(userToDelete.id, token || undefined);
      await loadData();
      Alert.alert("Success", t("admin.userManagement.deleteSuccess"));
      setUserToDelete(null);
    } catch (error) {
      console.error("Error deleting user:", error);
      Alert.alert("Error", t("admin.userManagement.deleteError"));
    } finally {
      setIsActionLoading(null);
    }
  };

  const openDeleteModal = (user: User) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
    setShowActionsMenu(null);
  };

  if (authLoading || !isSuperAdmin) {
    return (
      <View style={styles.container} />
    );
  }

  if (loading && users.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.userManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Users List */}
      <ScrollView
        style={styles.usersList}
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
        {/* Filters toggle */}
        <View style={{ paddingHorizontal: 16, paddingBottom: showFilters ? 4 : 16 }}>
          <TouchableOpacity
            onPress={() => setShowFilters((prev) => !prev)}
            style={styles.filterTextButtonContainer}
          >
            <Text style={styles.filterTextButton}>
              {showFilters
                ? t("admin.userManagement.hideFilters")
                : t("admin.userManagement.showFilters")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search and Filters */}
        {showFilters && (
          <View style={styles.filtersContainer}>
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder={t("admin.userManagement.searchPlaceholder")}
                placeholderTextColor="#6B7280"
                value={searchTerm}
                onChangeText={handleSearch}
              />
            </View>

            {/* Filter Dropdowns */}
            <View style={styles.filterDropdownsRow}>
              <TouchableOpacity
                style={[
                  styles.filterDropdown,
                  selectedUserType !== "" && styles.filterDropdownActive,
                ]}
                onPress={() => setShowRoleFilterModal(true)}
              >
                <MaterialCommunityIcons name="account-group" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
                  {selectedUserType === ""
                    ? t("admin.userManagement.allRoles")
                    : getUserTypeLabel(selectedUserType as UserType)}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>
                {t("admin.userManagement.sortByLabel")}
              </Text>
              <TouchableOpacity
                style={[
                  styles.sortButton,
                  sortBy === "name" && styles.sortButtonActive,
                ]}
                onPress={() => handleSort("name")}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortBy === "name" && styles.sortButtonTextActive,
                  ]}
                >
                  {t("admin.userManagement.sortName")}
                </Text>
                {sortBy === "name" && (
                  <MaterialCommunityIcons
                    name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                    size={12}
                    color="#fff"
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sortButton,
                  sortBy === "email" && styles.sortButtonActive,
                ]}
                onPress={() => handleSort("email")}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortBy === "email" && styles.sortButtonTextActive,
                  ]}
                >
                  {t("admin.userManagement.sortEmail")}
                </Text>
                {sortBy === "email" && (
                  <MaterialCommunityIcons
                    name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                    size={12}
                    color="#fff"
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sortButton,
                  sortBy === "createdAt" && styles.sortButtonActive,
                ]}
                onPress={() => handleSort("createdAt")}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortBy === "createdAt" && styles.sortButtonTextActive,
                  ]}
                >
                  {t("admin.userManagement.sortDate")}
                </Text>
                {sortBy === "createdAt" && (
                  <MaterialCommunityIcons
                    name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                    size={12}
                    color="#fff"
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
        {users.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="account-group" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>
              {t("admin.userManagement.noUsersFound")}
            </Text>
            <Text style={styles.emptySubtext}>
              {t("admin.userManagement.noUsersFoundSubtext")}
            </Text>
          </View>
        ) : (
          users.map((user) => (
            <View key={user.id} style={styles.userCard}>
              <View style={styles.userCardHeader}>
                <View style={styles.userInfo}>
                  <View style={[styles.avatar, { backgroundColor: getAvatarColor(user.id) }]}>
                    <Text style={styles.avatarText}>
                      {getUserInitials(user)}
                    </Text>
                  </View>
                  <View style={styles.userDetails}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>
                        {getUserDisplayName(user)}
                      </Text>
                      <View style={styles.adminBadge}>
                        {(user.userType === "SUPER_ADMIN" || user.userType === "BRANCH_ADMIN") && (
                          <MaterialCommunityIcons
                            name="shield-check"
                            size={10}
                            color="#fff"
                          />
                        )}
                        <Text style={styles.adminBadgeText}>
                          {getUserTypeLabel(user.userType)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          user.isActive
                            ? styles.statusBadgeActive
                            : styles.statusBadgeInactive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            user.isActive
                              ? styles.statusBadgeTextActive
                              : styles.statusBadgeTextInactive,
                          ]}
                        >
                          {user.isActive
                            ? t("admin.userManagement.active")
                            : t("admin.userManagement.inactive")}
                        </Text>
                      </View>
                      {user.orgRole ? (
                        <View style={styles.orgRoleBadge}>
                          <Text style={styles.orgRoleBadgeText}>
                            {String(user.orgRole).replace(/_/g, " ")}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {user.organization?.name ? (
                      <Text style={styles.organizationNameText} numberOfLines={1}>
                        {user.organization.name}
                      </Text>
                    ) : null}
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
                        <MaterialCommunityIcons name="calendar" size={12} color="#9CA3AF" />
                        <Text style={styles.userMetaText}>
                          {formatDate(user.createdAt)}
                        </Text>
                      </View>
                      <View style={styles.userMetaItem}>
                        <MaterialCommunityIcons
                          name="cart"
                          size={12}
                          color="#9CA3AF"
                        />
                        <Text style={styles.userMetaText}>
                          {user._count?.orders || 0}{" "}
                          {t("admin.userManagement.orders")}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => {
                    setActionsUser(user);
                    setShowActionsMenu(user.id);
                    setActionsModalVisible(true);
                  }}
                  disabled={isActionLoading === user.id}
                >
                  {isActionLoading === user.id ? (
                    <ActivityIndicator size="small" color="#9CA3AF" />
                  ) : (
                    <MaterialCommunityIcons name="dots-vertical" size={18} color="#9CA3AF" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Actions Bottom Sheet Modal */}
      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setActionsModalVisible(false);
          setShowActionsMenu(null);
          setActionsUser(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setActionsModalVisible(false);
            setShowActionsMenu(null);
            setActionsUser(null);
          }}
        >
          <Pressable
            style={styles.sheetContainer}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            {actionsUser && (
              <View style={styles.sheetContent}>
                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    openOrgDialog(actionsUser);
                  }}
                >
                  <MaterialCommunityIcons name="domain" size={16} color="#ec4899" />
                  <Text style={styles.sheetItemText}>
                    {t("admin.userManagement.assignOrganization", {
                      defaultValue: "Assign organization",
                    })}
                  </Text>
                </TouchableOpacity>

                {actionsUser.organizationId ? (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      handleMakeOrdinaryUser(actionsUser);
                    }}
                    disabled={isActionLoading === actionsUser.id}
                  >
                    <MaterialCommunityIcons name="account-remove" size={16} color="#ec4899" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.userManagement.changeToOrdinary", {
                        defaultValue: "Change to ordinary user",
                      })}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    setActionsModalVisible(false);
                    handleToggleStatus(actionsUser);
                  }}
                  disabled={isActionLoading === actionsUser.id}
                >
                  <MaterialCommunityIcons
                    name={
                      actionsUser.isActive
                        ? "close-circle"
                        : "check-circle"
                    }
                    size={16}
                    color={actionsUser.isActive ? "#ef4444" : "#22c55e"}
                  />
                  <Text
                    style={[
                      styles.sheetItemText,
                      actionsUser.isActive && styles.actionTextDanger,
                    ]}
                  >
                    {actionsUser.isActive
                      ? t("admin.userManagement.deactivate")
                      : t("admin.userManagement.activate")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => {
                    setActionsModalVisible(false);
                    setShowActionsMenu(null);
                    setActionsUser(null);
                  }}
                >
                  <Text style={styles.sheetCancelText}>
                    {t("admin.userManagement.deleteUserCancel")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Assign Organization Modal */}
      <Modal
        visible={orgDialogOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setOrgDialogOpen(false);
          setOrgDialogUser(null);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setOrgDialogOpen(false);
            setOrgDialogUser(null);
          }}
        >
          <Pressable
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              {t("admin.userManagement.assignOrganization", {
                defaultValue: "Assign organization",
              })}
            </Text>

            <Text style={styles.modalDescription}>
              {t("admin.userManagement.organization", { defaultValue: "Organization" })}
            </Text>

            <View style={{ gap: 10, marginTop: 10 }}>
              <View style={styles.searchContainer}>
                <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("admin.userManagement.searchPlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={orgSearchTerm}
                  onChangeText={setOrgSearchTerm}
                />
              </View>

              <ScrollView style={{ maxHeight: 260, borderRadius: 10, borderWidth: 1, borderColor: "#262626" }}>
                <TouchableOpacity
                  style={styles.bottomSheetOption}
                  onPress={() => setEditOrganizationId("")}
                >
                  <Text style={styles.bottomSheetOptionText}>
                    {t("admin.userManagement.noOrganization", { defaultValue: "No organization" })}
                  </Text>
                  {!editOrganizationId && (
                    <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                  )}
                </TouchableOpacity>
                {filteredOrganizations.map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    style={[
                      styles.bottomSheetOption,
                      editOrganizationId === o.id && styles.bottomSheetOptionActive,
                    ]}
                    onPress={() => setEditOrganizationId(o.id)}
                  >
                    <Text
                      style={[
                        styles.bottomSheetOptionText,
                        editOrganizationId === o.id && styles.bottomSheetOptionTextActive,
                      ]}
                    >
                      {o.name || o.id}
                    </Text>
                    {editOrganizationId === o.id && (
                      <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.modalDescription}>
                {t("admin.userManagement.orgRole", { defaultValue: "Organization role" })}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {(["ORG_OWNER", "ORG_ADMIN", "ORG_STAFF"] as OrgRole[]).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.sortButton,
                      editOrgRole === r && styles.sortButtonActive,
                      !editOrganizationId && { opacity: 0.5 },
                    ]}
                    onPress={() => editOrganizationId && setEditOrgRole(r)}
                    disabled={!editOrganizationId}
                  >
                    <Text
                      style={[
                        styles.sortButtonText,
                        editOrgRole === r && styles.sortButtonTextActive,
                      ]}
                    >
                      {r === "ORG_OWNER" ? "Owner" : r === "ORG_ADMIN" ? "Admin" : "Staff"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.modalButtons, { marginTop: 12 }]}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setOrgDialogOpen(false);
                  setOrgDialogUser(null);
                }}
              >
                <Text style={styles.modalButtonCancelText}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDelete]}
                onPress={saveOrgDialog}
                disabled={!orgDialogUser || isActionLoading === orgDialogUser?.id}
              >
                <Text style={styles.modalButtonDeleteText}>
                  {t("common.save", { defaultValue: "Save" })}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={styles.pagination}>
          <Text style={styles.paginationText}>
            {t("admin.userManagement.showingUsers", {
              count: users.length,
              total: totalCount,
            })}
          </Text>
          <View style={styles.paginationButtons}>
            <TouchableOpacity
              style={[
                styles.paginationButton,
                currentPage === 1 && styles.paginationButtonDisabled,
              ]}
              onPress={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <MaterialCommunityIcons name="chevron-left" size={16} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.paginationPageText}>
              {t("admin.userManagement.pageOf", {
                current: currentPage,
                total: totalPages,
              })}
            </Text>
            <TouchableOpacity
              style={[
                styles.paginationButton,
                currentPage === totalPages && styles.paginationButtonDisabled,
              ]}
              onPress={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDeleteModal(false)}
        >
          <Pressable
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              {t("admin.userManagement.deleteUserTitle")}
            </Text>
            <Text style={styles.modalDescription}>
              {t("admin.userManagement.deleteUserDescription", {
                name: userToDelete
                  ? getUserDisplayName(userToDelete)
                  : t("admin.userManagement.users"),
              })}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.modalButtonCancelText}>
                  {t("admin.userManagement.deleteUserCancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDelete]}
                onPress={handleDeleteUser}
              >
                <Text style={styles.modalButtonDeleteText}>
                  {t("admin.userManagement.deleteUserConfirm")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Role Filter Bottom Sheet */}
      <Modal
        transparent
        animationType="slide"
        visible={showRoleFilterModal}
        onRequestClose={() => setShowRoleFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowRoleFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.userManagement.selectRole", { defaultValue: "Select Type" })}
              </Text>
              <TouchableOpacity onPress={() => setShowRoleFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedUserType === "" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleUserTypeFilter("all");
                  setShowRoleFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedUserType === "" && styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.userManagement.allRoles")}
                </Text>
                {selectedUserType === "" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              {(["SUPER_ADMIN", "BRANCH_ADMIN", "EMPLOYEE", "WAITER", "USER"] as UserType[]).map((ut) => (
                <TouchableOpacity
                  key={ut}
                  style={[
                    styles.bottomSheetOption,
                    selectedUserType === ut && styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    handleUserTypeFilter(ut);
                    setShowRoleFilterModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      selectedUserType === ut && styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {getUserTypeLabel(ut)}
                  </Text>
                  {selectedUserType === ut && (
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
  header: {
    padding: 20,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ec4899",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  filtersContainer: {
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#171717",
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
  filterDropdownsRow: {
    gap: 12,
  },
  filterDropdown: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#171717",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#262626",
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
    backgroundColor: "#171717",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#D1D5DB",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sortLabel: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
  },
  sortButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  sortButtonText: {
    fontSize: 12,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  sortButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  orgRoleBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.35)",
  },
  orgRoleBadgeText: {
    fontSize: 10,
    color: "#93c5fd",
    fontWeight: "700",
  },
  organizationNameText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
    marginBottom: 2,
  },
  usersList: {
    flex: 1,
    padding: 16,
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
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  userCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#262626",
  },
  userCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  userInfo: {
    flex: 1,
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
  adminBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeActive: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
  },
  statusBadgeInactive: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  statusBadgeTextActive: {
    color: "#22c55e",
  },
  statusBadgeTextInactive: {
    color: "#ef4444",
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
  menuButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  actionsMenu: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#262626",
    gap: 8,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: "#262626",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#2a2a2a",
    marginTop: 8,
    marginBottom: 8,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
  },
  sheetItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "600",
  },
  sheetCancel: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#262626",
    borderRadius: 8,
  },
  sheetCancelText: {
    color: "#D1D5DB",
    fontWeight: "700",
    fontSize: 14,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  actionItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  actionText: {
    fontSize: 13,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  actionTextDanger: {
    color: "#ef4444",
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
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  paginationText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  paginationButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  paginationButtonDisabled: {
    backgroundColor: "#262626",
    opacity: 0.5,
  },
  paginationPageText: {
    fontSize: 13,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  filterTextButtonContainer: {
    alignSelf: "flex-end",
  },
  filterTextButton: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
    textDecorationLine: "underline",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#171717",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#262626",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    color: "#9CA3AF",
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: "#262626",
  },
  modalButtonCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  modalButtonDelete: {
    backgroundColor: "#ef4444",
  },
  modalButtonDeleteText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
