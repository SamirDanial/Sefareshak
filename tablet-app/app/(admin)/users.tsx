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
import branchService, { type Organization } from "@/src/services/branchService";
import { userService, type OrgRole, type User, type UserType } from "@/src/services/userService";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
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
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();

  const { getToken, userType, isLoading: authLoading } = useAuthRole();
  const { isSuperAdmin: isSuperAdminFromPermissions } = usePermissions();
  const isSuperAdmin = userType === "SUPER_ADMIN" || isSuperAdminFromPermissions;

  const lastScrollY = useRef(0);
  const isTablet = width >= 768;

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserType, setSelectedUserType] = useState<string>("");
  const [sortBy, setSortBy] = useState<"name" | "email" | "createdAt" | "userType">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsUser, setActionsUser] = useState<User | null>(null);

  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [orgDialogUser, setOrgDialogUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [editOrganizationId, setEditOrganizationId] = useState<string>("");
  const [editOrgRole, setEditOrgRole] = useState<OrgRole>("ORG_STAFF");
  const [orgSearchTerm, setOrgSearchTerm] = useState<string>("");
  const [searchResults, setSearchResults] = useState<Organization[]>([]);
  const [isSearchingOrgs, setIsSearchingOrgs] = useState(false);

  const [showRoleFilterModal, setShowRoleFilterModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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
    if (!isSuperAdmin) {
      router.replace("/(admin)" as any);
    }
  }, [authLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadData();
    }
  }, []);

  useEffect(() => {
    if (isInitialMount.current) return;

    isSearchingRef.current = true;
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      loadData();
      setTimeout(() => {
        isSearchingRef.current = false;
      }, 100);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

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
        searchTerm.trim(),
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
    setSearchResults([]);
    setOrgDialogOpen(true);
    setActionsModalVisible(false);
  };

  const filteredOrganizations = useMemo(() => {
    if (!orgSearchTerm.trim()) return [];
    return searchResults;
  }, [orgSearchTerm, searchResults]);

  useEffect(() => {
    const searchOrgs = async () => {
      if (!orgSearchTerm.trim()) {
        setSearchResults([]);
        return;
      }
      setIsSearchingOrgs(true);
      try {
        const token = await getToken();
        const results = await branchService.searchOrganizations(orgSearchTerm, token || undefined);
        setSearchResults(results);
      } catch (error) {
        console.error("Error searching organizations:", error);
        setSearchResults([]);
      } finally {
        setIsSearchingOrgs(false);
      }
    };

    const timeoutId = setTimeout(searchOrgs, 300);
    return () => clearTimeout(timeoutId);
  }, [orgSearchTerm]);

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
      await userService.setUserOrganization(user.id, { organizationId: null, orgRole: null }, token || undefined);
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

  const handleUserTypeFilter = (type: string) => {
    setSelectedUserType(type === "all" ? "" : type);
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

  const getUserTypeLabel = (type: UserType): string => {
    const map: Record<UserType, string> = {
      SUPER_ADMIN: "Super Admin",
      BRANCH_ADMIN: "Branch Admin",
      EMPLOYEE: "Employee",
      WAITER: "Waiter",
      USER: "User",
    };
    return map[type] || type;
  };

  const handleToggleStatus = async (user: User) => {
    try {
      setIsActionLoading(user.id);
      const token = await getToken();
      await userService.toggleUserStatus(user.id, token || undefined);
      await loadData();
      setToast({
        visible: true,
        message: user.isActive
          ? t("admin.userManagement.userDeactivated", { name: getUserDisplayName(user) })
          : t("admin.userManagement.userActivated", { name: getUserDisplayName(user) }),
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

  if (authLoading || !isSuperAdmin) {
    return <View style={styles.container} />;
  }

  if (loading && users.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("admin.userManagement.loading")}</Text>
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
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>{t("admin.userManagement.title")}</Text>
            <Text style={styles.headerSubtitle}>{t("admin.userManagement.description")}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowFilters((prev) => !prev)} style={styles.filterTextButton}>
            <Text style={styles.filterTextButtonText}>
              {showFilters ? t("admin.userManagement.hideFilters") : t("admin.userManagement.showFilters")}
            </Text>
          </TouchableOpacity>
        </View>

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

            <View style={styles.filterDropdownsRow}>
              <TouchableOpacity
                style={[styles.filterDropdown, selectedUserType !== "" && styles.filterDropdownActive]}
                onPress={() => setShowRoleFilterModal(true)}
              >
                <MaterialCommunityIcons name="account-group" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
                  {selectedUserType === "" ? t("admin.userManagement.allRoles") : getUserTypeLabel(selectedUserType as UserType)}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>{t("admin.userManagement.sortByLabel")}</Text>

              <TouchableOpacity
                style={[styles.sortButton, sortBy === "name" && styles.sortButtonActive]}
                onPress={() => handleSort("name")}
              >
                <Text style={[styles.sortButtonText, sortBy === "name" && styles.sortButtonTextActive]}>
                  {t("admin.userManagement.sortName")}
                </Text>
                {sortBy === "name" && (
                  <MaterialCommunityIcons name={sortOrder === "asc" ? "arrow-up" : "arrow-down"} size={12} color="#fff" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sortButton, sortBy === "email" && styles.sortButtonActive]}
                onPress={() => handleSort("email")}
              >
                <Text style={[styles.sortButtonText, sortBy === "email" && styles.sortButtonTextActive]}>
                  {t("admin.userManagement.sortEmail")}
                </Text>
                {sortBy === "email" && (
                  <MaterialCommunityIcons name={sortOrder === "asc" ? "arrow-up" : "arrow-down"} size={12} color="#fff" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sortButton, sortBy === "createdAt" && styles.sortButtonActive]}
                onPress={() => handleSort("createdAt")}
              >
                <Text style={[styles.sortButtonText, sortBy === "createdAt" && styles.sortButtonTextActive]}>
                  {t("admin.userManagement.sortDate")}
                </Text>
                {sortBy === "createdAt" && (
                  <MaterialCommunityIcons name={sortOrder === "asc" ? "arrow-up" : "arrow-down"} size={12} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {users.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="account-group" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>{t("admin.userManagement.noUsersFound")}</Text>
            <Text style={styles.emptySubtext}>{t("admin.userManagement.noUsersFoundSubtext")}</Text>
          </View>
        ) : (
          <View style={[styles.usersGrid, isTablet && styles.usersGridTablet]}>
            {users.map((user) => (
              <View key={user.id} style={[styles.userCard, isTablet && styles.userCardTablet]}>
                <View style={styles.userCardHeader}>
                  <View style={styles.userInfo}>
                    <View style={[styles.avatar, { backgroundColor: getAvatarColor(user.id) }]}>
                      <Text style={styles.avatarText}>{getUserInitials(user)}</Text>
                    </View>
                    <View style={styles.userDetails}>
                      <View style={styles.userNameRow}>
                        <Text style={styles.userName}>{getUserDisplayName(user)}</Text>

                        <View style={styles.adminBadge}>
                          {(user.userType === "SUPER_ADMIN" || user.userType === "BRANCH_ADMIN") && (
                            <MaterialCommunityIcons name="shield-check" size={10} color="#fff" />
                          )}
                          <Text style={styles.adminBadgeText}>{getUserTypeLabel(user.userType)}</Text>
                        </View>

                        <View style={[styles.statusBadge, user.isActive ? styles.statusBadgeActive : styles.statusBadgeInactive]}>
                          <Text
                            style={[
                              styles.statusBadgeText,
                              user.isActive ? styles.statusBadgeTextActive : styles.statusBadgeTextInactive,
                            ]}
                          >
                            {user.isActive ? t("admin.userManagement.active") : t("admin.userManagement.inactive")}
                          </Text>
                        </View>

                        {user.orgRole ? (
                          <View style={styles.orgRoleBadge}>
                            <Text style={styles.orgRoleBadgeText}>{String(user.orgRole).replace(/_/g, " ")}</Text>
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
                          <MaterialCommunityIcons name="email" size={12} color="#9CA3AF" />
                          <Text style={styles.userMetaText} numberOfLines={1}>
                            {user.email}
                          </Text>
                        </View>
                      </View>

                      {user.phone && (
                        <View style={styles.userMetaRow}>
                          <View style={styles.userMetaItem}>
                            <MaterialCommunityIcons name="phone" size={12} color="#9CA3AF" />
                            <Text style={styles.userMetaText}>{user.phone}</Text>
                          </View>
                        </View>
                      )}

                      <View style={styles.userMetaRow}>
                        <View style={styles.userMetaItem}>
                          <MaterialCommunityIcons name="calendar" size={12} color="#9CA3AF" />
                          <Text style={styles.userMetaText}>{formatDate(user.createdAt)}</Text>
                        </View>
                        <View style={styles.userMetaItem}>
                          <MaterialCommunityIcons name="cart" size={12} color="#9CA3AF" />
                          <Text style={styles.userMetaText}>
                            {user._count?.orders || 0} {t("admin.userManagement.orders")}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.menuButton}
                    onPress={() => {
                      setActionsUser(user);
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
            ))}
          </View>
        )}

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
                style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
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
                style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]}
                onPress={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          setActionsModalVisible(false);
          setActionsUser(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setActionsModalVisible(false);
            setActionsUser(null);
          }}
        >
          <Pressable style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            {actionsUser && (
              <View style={styles.sheetContent}>
                <TouchableOpacity style={styles.sheetItem} onPress={() => openOrgDialog(actionsUser)}>
                  <MaterialCommunityIcons name="domain" size={16} color="#ec4899" />
                  <Text style={styles.sheetItemText}>
                    {t("admin.userManagement.assignOrganization", { defaultValue: "Assign organization" })}
                  </Text>
                </TouchableOpacity>

                {actionsUser.organizationId ? (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => handleMakeOrdinaryUser(actionsUser)}
                    disabled={isActionLoading === actionsUser.id}
                  >
                    <MaterialCommunityIcons name="account-remove" size={16} color="#ec4899" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.userManagement.changeToOrdinary", { defaultValue: "Change to ordinary user" })}
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
                    name={actionsUser.isActive ? "close-circle" : "check-circle"}
                    size={16}
                    color={actionsUser.isActive ? "#ef4444" : "#22c55e"}
                  />
                  <Text style={[styles.sheetItemText, actionsUser.isActive && styles.actionTextDanger]}>
                    {actionsUser.isActive ? t("admin.userManagement.deactivate") : t("admin.userManagement.activate")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => {
                    setActionsModalVisible(false);
                    setActionsUser(null);
                  }}
                >
                  <Text style={styles.sheetCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {t("admin.userManagement.assignOrganization", { defaultValue: "Assign organization" })}
            </Text>

            <Text style={styles.modalDescription}>{t("admin.userManagement.organization", { defaultValue: "Organization" })}</Text>

            <View style={styles.modalFormContainer}>
              <View style={styles.searchContainer}>
                <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("admin.userManagement.searchOrganizationsPlaceholder", { defaultValue: "Search Organizations..." })}
                  placeholderTextColor="#6B7280"
                  value={orgSearchTerm}
                  onChangeText={setOrgSearchTerm}
                />
              </View>

              {isSearchingOrgs ? (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#ec4899" />
                </View>
              ) : filteredOrganizations.length > 0 ? (
                <ScrollView style={styles.orgListScrollView}>
                  {filteredOrganizations.map((o) => (
                    <TouchableOpacity
                      key={o.id}
                      style={[styles.bottomSheetOption, editOrganizationId === o.id && styles.bottomSheetOptionActive]}
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
                      {editOrganizationId === o.id && <MaterialCommunityIcons name="check" size={18} color="#ec4899" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}

              <Text style={styles.modalDescription}>{t("admin.userManagement.orgRole", { defaultValue: "Organization role" })}</Text>
              <View style={styles.roleButtonsContainer}>
                {(["ORG_OWNER", "ORG_ADMIN", "ORG_STAFF"] as OrgRole[]).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.sortButton, editOrgRole === r && styles.sortButtonActive, !editOrganizationId && { opacity: 0.5 }]}
                    onPress={() => editOrganizationId && setEditOrgRole(r)}
                    disabled={!editOrganizationId}
                  >
                    <Text style={[styles.sortButtonText, editOrgRole === r && styles.sortButtonTextActive]}>
                      {r === "ORG_OWNER" ? "Owner" : r === "ORG_ADMIN" ? "Admin" : "Staff"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setOrgDialogOpen(false);
                  setOrgDialogUser(null);
                }}
              >
                <Text style={styles.modalButtonCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={saveOrgDialog}
                disabled={!orgDialogUser || isActionLoading === orgDialogUser?.id}
              >
                <Text style={styles.modalButtonPrimaryText}>{t("common.save", { defaultValue: "Save" })}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        animationType="slide"
        visible={showRoleFilterModal}
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowRoleFilterModal(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowRoleFilterModal(false)}>
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>
                {t("admin.userManagement.selectRole", { defaultValue: "Select Type" })}
              </Text>

              <ScrollView style={styles.sheetScrollView} showsVerticalScrollIndicator>
                <TouchableOpacity
                  style={[styles.sheetItem, selectedUserType === "" && styles.sheetItemActive]}
                  onPress={() => {
                    handleUserTypeFilter("all");
                    setShowRoleFilterModal(false);
                  }}
                >
                  <Text style={[styles.sheetItemText, selectedUserType === "" && styles.sheetItemTextActive]}>
                    {t("admin.userManagement.allRoles")}
                  </Text>
                  {selectedUserType === "" && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                </TouchableOpacity>

                {(["SUPER_ADMIN", "BRANCH_ADMIN", "EMPLOYEE", "WAITER", "USER"] as UserType[]).map((ut) => (
                  <TouchableOpacity
                    key={ut}
                    style={[styles.sheetItem, selectedUserType === ut && styles.sheetItemActive]}
                    onPress={() => {
                      handleUserTypeFilter(ut);
                      setShowRoleFilterModal(false);
                    }}
                  >
                    <Text style={[styles.sheetItemText, selectedUserType === ut && styles.sheetItemTextActive]}>
                      {getUserTypeLabel(ut)}
                    </Text>
                    {selectedUserType === ut && (
                      <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowRoleFilterModal(false)}>
                <Text style={styles.sheetCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
        topOffset={16}
      />

      <RefreshSpinner visible={refreshing} topOffset={16} />
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
    alignItems: "flex-start",
    paddingBottom: 16,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
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
    color: "#9CA3AF",
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
  filterDropdownsRow: {
    gap: 12,
  },
  filterDropdown: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
    backgroundColor: "#ffffff",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
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
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sortButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  sortButtonText: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
  },
  sortButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  filterTextButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterTextButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
    textDecorationLine: "underline",
  },
  usersGrid: {
    flexDirection: "column",
  },
  usersGridTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  userCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  userCardTablet: {
    width: "48%",
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
    color: "#111827",
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ec4899",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  adminBadgeText: {
    fontSize: 10,
    color: "#fff",
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeActive: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderColor: "rgba(34, 197, 94, 0.35)",
  },
  statusBadgeInactive: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusBadgeTextActive: {
    color: "#86efac",
  },
  statusBadgeTextInactive: {
    color: "#fca5a5",
  },
  orgRoleBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#3b82f6",
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  orgRoleBadgeText: {
    fontSize: 10,
    color: "#fff",
    fontWeight: "700",
  },
  organizationNameText: {
    fontSize: 12,
    color: "#374151",
    marginTop: 4,
    marginBottom: 2,
  },
  userMetaRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  userMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  userMetaText: {
    fontSize: 12,
    color: "#374151",
    maxWidth: 220,
  },
  menuButton: {
    padding: 8,
    marginTop: -6,
    marginRight: -6,
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
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
    backgroundColor: "#f3f4f6",
    opacity: 0.5,
  },
  paginationPageText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 520,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    height: 500,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  modalFormContainer: {
    flex: 1,
    gap: 10,
    marginTop: 10,
  },
  orgListScrollView: {
    maxHeight: 200,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  roleButtonsContainer: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
  },
  modalButtonCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  modalButtonPrimary: {
    backgroundColor: "#ec4899",
  },
  modalButtonPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modalButtonDanger: {
    backgroundColor: "#ef4444",
  },
  modalButtonDangerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    marginBottom: 12,
  },
  sheetContent: {
    paddingBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  sheetScrollView: {
    maxHeight: 420,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 10,
  },
  sheetItemActive: {
    borderColor: "#ec4899",
  },
  sheetItemDanger: {
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
    flex: 1,
  },
  sheetItemTextActive: {
    color: "#111827",
    fontWeight: "600",
  },
  sheetDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 8,
  },
  actionTextDanger: {
    color: "#ef4444",
  },
  sheetCancel: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    alignItems: "center",
    marginTop: 6,
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  bottomSheetOptionActive: {
    backgroundColor: "#fdf2f8",
    borderColor: "#ec4899",
    borderWidth: 2,
  },
  bottomSheetOptionText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#111827",
    fontWeight: "600",
  },
});
