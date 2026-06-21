import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { useBranch } from "@/src/contexts/BranchContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import branchService from "@/src/services/branchService";
import { staffService, type StaffRole, type StaffUser, type UserType } from "@/src/services/staffService";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { getAvatarColor } from "@/src/utils/avatarColors";

const USER_TYPE_OPTIONS: Array<{ value: UserType; label: string }> = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "BRANCH_ADMIN", label: "Branch Admin" },
  { value: "EMPLOYEE", label: "Employee" },
  { value: "WAITER", label: "Waiter" },
  { value: "USER", label: "User" },
];

const isStaffUser = (u: StaffUser) => u.userType !== "USER" || Boolean(u.orgRole);

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

export default function StaffManagementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { getToken, userType, isLoading: authLoading } = useAuthRole();
  const { rbacUser, isLoading: permissionsLoading } = usePermissions();
  const { selectedOrganizationId, isLoading: orgLoading } = useOrganization();

  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);

  const viewerOrgRole = (rbacUser as any)?.orgRole as string | null | undefined;
  const canManageStaff = userType === "SUPER_ADMIN" || viewerOrgRole === "ORG_OWNER" || viewerOrgRole === "ORG_ADMIN";

  useEffect(() => {
    if (authLoading || permissionsLoading) return;
    if (!canManageStaff) {
      router.replace("/(admin)" as any);
    }
  }, [authLoading, permissionsLoading, canManageStaff, router]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedUserType, setSelectedUserType] = useState<string>("");
  const { selectedBranchId, setSelectedBranch } = useBranch();
  const setSelectedBranchId = (id: string) => setSelectedBranch(id);
  const [assignedOnly, setAssignedOnly] = useState(false);

  const [hireDialogOpen, setHireDialogOpen] = useState(false);
  const [hireEmail, setHireEmail] = useState("");
  const [hireSearching, setHireSearching] = useState(false);
  const [hireCandidate, setHireCandidate] = useState<StaffUser | null>(null);
  const [hireSaving, setHireSaving] = useState(false);

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<StaffUser | null>(null);
  const [removing, setRemoving] = useState(false);

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code?: string | null }>>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showBranchFilterModal, setShowBranchFilterModal] = useState(false);
  const [showUserTypeFilterModal, setShowUserTypeFilterModal] = useState(false);

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
      if (term) {
        const name = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase();
        const email = (u.email || "").toLowerCase();
        if (!name.includes(term) && !email.includes(term)) return false;
      }
      return true;
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

  const openHireDialog = () => {
    setHireEmail("");
    setHireCandidate(null);
    setHireDialogOpen(true);
  };

  const searchHireCandidate = async () => {
    const email = hireEmail.trim();
    if (!email) return;

    try {
      setHireSearching(true);
      setHireCandidate(null);
      const token = await getToken();
      if (!token) return;
      const user = await staffService.searchHireCandidate(email, token || undefined);
      setHireCandidate(user);
    } catch (e: any) {
      const message = e?.data?.error || e?.message;
      setHireCandidate(null);
      setToast({
        visible: true,
        message:
          message ||
          t("admin.staffManagement.hireSearchFailed", {
            defaultValue: "Failed to search user",
          }),
        type: "error",
      });
    } finally {
      setHireSearching(false);
    }
  };

  const canRemoveFromOrg = (target: StaffUser) => {
    if (userType === "SUPER_ADMIN") return true;
    return viewerOrgRole === "ORG_OWNER" && (target.orgRole === "ORG_ADMIN" || target.orgRole === "ORG_STAFF");
  };

  const isLastOrgOwner = (target?: StaffUser | null) => {
    if (!target) return false;
    if (target.orgRole !== "ORG_OWNER") return false;
    const owners = (staff || []).filter((u) => u.orgRole === "ORG_OWNER");
    return owners.length === 1 && owners[0]?.id === target.id;
  };

  const openRemoveDialog = (target: StaffUser) => {
    if (isLastOrgOwner(target)) {
      setToast({
        visible: true,
        message: t("admin.staffManagement.lastOwnerRemoveBlocked", {
          defaultValue: "You can't remove the last ORG_OWNER from the organization",
        }),
        type: "error",
      });
      return;
    }
    setRemoveTarget(target);
    setRemoveDialogOpen(true);
  };

  const confirmRemoveFromOrg = async () => {
    if (!removeTarget) return;
    if (isLastOrgOwner(removeTarget)) {
      setToast({
        visible: true,
        message: t("admin.staffManagement.lastOwnerRemoveBlocked", {
          defaultValue: "You can't remove the last ORG_OWNER from the organization",
        }),
        type: "error",
      });
      return;
    }

    try {
      setRemoving(true);
      const token = await getToken();
      if (!token) return;
      await staffService.removeUserFromOrganization(removeTarget.id, token || undefined);
      setRemoveDialogOpen(false);
      setRemoveTarget(null);
      await loadData();
      setToast({
        visible: true,
        message: t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }),
        type: "success",
      });
    } catch (e: any) {
      const message = e?.data?.error || e?.message || "Failed to remove user";
      setToast({ visible: true, message, type: "error" });
    } finally {
      setRemoving(false);
    }
  };

  const confirmHire = async () => {
    if (!hireCandidate) return;

    try {
      setHireSaving(true);
      const token = await getToken();
      if (!token) return;
      await staffService.hireStaff(hireCandidate.id, token || undefined);

      setToast({
        visible: true,
        message: t("admin.staffManagement.hireSuccess", { defaultValue: "User hired successfully" }),
        type: "success",
      });

      setHireDialogOpen(false);
      setHireEmail("");
      setHireCandidate(null);
      await loadData();
    } catch (e: any) {
      const raw = e?.data?.error || e?.message || "Failed to hire user";
      const mapped =
        raw === "User already belongs to another organization"
          ? t("admin.staffManagement.hireAlreadyInOtherOrg", {
              defaultValue: "This user is already assigned to another organization",
            })
          : raw === "User is already in this organization"
          ? t("admin.staffManagement.hireAlreadyInThisOrg", {
              defaultValue: "This user is already in this organization",
            })
          : raw;
      setToast({ visible: true, message: String(mapped), type: "error" });
    } finally {
      setHireSaving(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      if (userType === "SUPER_ADMIN" && !selectedOrganizationId) {
        setStaff([]);
        setBranches([]);
        setRoles([]);
        return;
      }

      const token = await getToken();

      const [staffUsers, branchList, roleList] = await Promise.all([
        staffService.getStaff(
          {
            branchId: selectedBranchId || undefined,
            userType: (selectedUserType || undefined) as UserType | undefined,
            includeInactive,
            assignedOnly,
          },
          token || undefined
        ),
        branchService.getBranches(token || undefined),
        staffService.getRoles(false, token || undefined),
      ]);

      setStaff(staffUsers.filter((u) => isStaffUser(u)));
      setBranches(
        (branchList || []).map((b: any) => ({
          id: b.id,
          name: (b.name || b.code || b.id) as string,
          code: b.code ?? null,
        }))
      );
      setRoles(roleList.filter((r) => (r.isActive ?? true) === true));
    } catch (e) {
      console.error("Failed to load staff management data", e);
      setToast({
        visible: true,
        message: t("admin.staffManagement.loadError", { defaultValue: "Failed to load staff data" }),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [includeInactive, selectedUserType, selectedBranchId, assignedOnly, selectedOrganizationId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [includeInactive, selectedUserType, selectedBranchId, assignedOnly, selectedOrganizationId])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (authLoading || permissionsLoading || !canManageStaff) {
    return <View style={styles.container} />;
  }

  if (loading && staff.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("admin.staffManagement.loading", { defaultValue: "Loading staff..." })}</Text>
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
        <View style={styles.pageHeader}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.pageTitle}>{t("admin.staffManagement.title", { defaultValue: "Staff Management" })}</Text>
            <Text style={styles.pageSubtitle}>
              {t("admin.staffManagement.description", {
                defaultValue: "Manage staff users, their branch assignments, and roles.",
              })}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setShowFilters((prev) => !prev)} style={styles.filterTextButton}>
            <Text style={styles.filterTextButtonText}>
              {showFilters
                ? t("admin.staffManagement.hideFilters", { defaultValue: "Hide Filters" })
                : t("admin.staffManagement.showFilters", { defaultValue: "Show Filters" })}
            </Text>
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filtersContainer}>
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder={t("admin.staffManagement.searchPlaceholder", { defaultValue: "Search by name or email" })}
                placeholderTextColor="#6B7280"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>

            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterDropdown, selectedBranchId !== "" && styles.filterDropdownActive]}
                onPress={() => setShowBranchFilterModal(true)}
              >
                <MaterialCommunityIcons name="store" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText} numberOfLines={1}>
                  {selectedBranchId
                    ? branches.find((b) => b.id === selectedBranchId)?.name ||
                      t("admin.staffManagement.allBranches", { defaultValue: "All branches" })
                    : t("admin.staffManagement.allBranches", { defaultValue: "All branches" })}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterDropdown, selectedUserType !== "" && styles.filterDropdownActive]}
                onPress={() => setShowUserTypeFilterModal(true)}
              >
                <MaterialCommunityIcons name="account-group" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText} numberOfLines={1}>
                  {selectedUserType
                    ? USER_TYPE_OPTIONS.find((o) => o.value === selectedUserType)?.label ||
                      t("admin.staffManagement.allStaffTypes", { defaultValue: "All staff types" })
                    : t("admin.staffManagement.allStaffTypes", { defaultValue: "All staff types" })}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.toggleButton, includeInactive && styles.toggleButtonActive]}
              onPress={() => setIncludeInactive((v) => !v)}
            >
              <Text style={[styles.toggleButtonText, includeInactive && styles.toggleButtonTextActive]}>
                {includeInactive
                  ? t("admin.staffManagement.includingInactive", { defaultValue: "Including inactive" })
                  : t("admin.staffManagement.activeOnly", { defaultValue: "Active only" })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toggleButton, assignedOnly && styles.toggleButtonActive]}
              onPress={() => setAssignedOnly((v) => !v)}
            >
              <Text style={[styles.toggleButtonText, assignedOnly && styles.toggleButtonTextActive]}>
                {assignedOnly
                  ? t("admin.staffManagement.assignedOnly", { defaultValue: "Assigned only" })
                  : t("admin.staffManagement.allStaff", { defaultValue: "All staff" })}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ paddingBottom: 12, flexDirection: "row", justifyContent: "flex-end" }}>
          <TouchableOpacity
            style={styles.hireButton}
            onPress={openHireDialog}
            disabled={!canManageStaff || (userType === "SUPER_ADMIN" && (!selectedOrganizationId || orgLoading))}
          >
            <MaterialCommunityIcons name="plus" size={16} color="#fff" />
            <Text style={styles.hireButtonText}>{t("admin.staffManagement.hireStaff", { defaultValue: "Hire staff" })}</Text>
          </TouchableOpacity>
        </View>

        {userType === "SUPER_ADMIN" && !selectedOrganizationId ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="domain" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>
              {t("admin.staffManagement.selectOrgFirst", { defaultValue: "Select an organization to view staff." })}
            </Text>
          </View>
        ) : filteredStaff.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="account-group" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>{t("admin.staffManagement.noStaffFound", { defaultValue: "No staff users found." })}</Text>
          </View>
        ) : (
          <View style={[styles.usersGrid, isTablet && styles.usersGridTablet]}>
            {filteredStaff.map((user) => (
              <View
                key={user.id}
                style={[
                  styles.userCard,
                  isTablet && styles.userCardTablet,
                  user.orgRole === "ORG_OWNER" ? styles.userCardOwner : user.orgRole === "ORG_ADMIN" ? styles.userCardAdmin : null,
                ]}
              >
                <View style={styles.userCardHeader}>
                  <View style={styles.userInfo}>
                    <View style={[styles.avatar, { backgroundColor: getAvatarColor(user.id) }]}>
                      <Text style={styles.avatarText}>{getUserInitials(user)}</Text>
                    </View>

                    <View style={styles.userDetails}>
                      <View style={styles.userNameRow}>
                        <Text style={styles.userName}>{getUserDisplayName(user)}</Text>

                        {user.orgRole === "ORG_OWNER" && (
                          <View style={[styles.orgRoleBadge, styles.orgOwnerBadge]}>
                            <Text style={[styles.orgRoleBadgeText, styles.orgOwnerBadgeText]}>ORG OWNER</Text>
                          </View>
                        )}
                        {user.orgRole === "ORG_ADMIN" && (
                          <View style={[styles.orgRoleBadge, styles.orgAdminBadge]}>
                            <Text style={[styles.orgRoleBadgeText, styles.orgAdminBadgeText]}>ORG ADMIN</Text>
                          </View>
                        )}
                        {user.orgRole === "ORG_STAFF" && (
                          <View style={[styles.orgRoleBadge, styles.orgStaffBadge]}>
                            <Text style={[styles.orgRoleBadgeText, styles.orgStaffBadgeText]}>ORG STAFF</Text>
                          </View>
                        )}

                        {user.userType === "SUPER_ADMIN" && (
                          <View style={styles.adminBadge}>
                            <MaterialCommunityIcons name="shield-check" size={10} color="#fff" />
                            <Text style={styles.adminBadgeText}>Super Admin</Text>
                          </View>
                        )}
                        {user.userType === "BRANCH_ADMIN" && (
                          <View style={[styles.adminBadge, styles.branchAdminBadge]}>
                            <MaterialCommunityIcons name="shield" size={10} color="#fff" />
                            <Text style={styles.adminBadgeText}>Branch Admin</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.userMetaRow}>
                        <View style={styles.userMetaItem}>
                          <MaterialCommunityIcons name="email" size={12} color="#9CA3AF" />
                          <Text style={styles.userMetaText} numberOfLines={1}>
                            {user.email}
                          </Text>
                        </View>
                      </View>

                      {user.orgRole === "ORG_OWNER" || user.orgRole === "ORG_ADMIN" ? (
                        <View style={styles.userMetaRow}>
                          <View style={styles.userMetaItem}>
                            <MaterialCommunityIcons name="domain" size={12} color="#9CA3AF" />
                            <Text style={styles.userMetaText}>
                              {t("admin.staffManagement.allBranchesAccess", { defaultValue: "All branches access" })}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.userMetaRow}>
                          <View style={styles.userMetaItem}>
                            <MaterialCommunityIcons name="store" size={12} color="#9CA3AF" />
                            <Text style={styles.userMetaText}>
                              {t("admin.staffManagement.assignedBranchesCount", {
                                defaultValue: "Assigned branches: {{count}}",
                                count: user.assignedBranches?.length ?? 0,
                              })}
                            </Text>
                          </View>
                        </View>
                      )}

                      {!user.orgRole && (
                        <View style={styles.userMetaRow}>
                          <View style={styles.userMetaItem}>
                            <MaterialCommunityIcons name="account" size={12} color="#9CA3AF" />
                            <Text style={styles.userMetaText}>{user.userType}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.manageButton}
                      onPress={() =>
                        router.push(
                          `/(admin)/staff-user/${user.id}?title=${encodeURIComponent(getUserDisplayName(user))}` as any
                        )
                      }
                      disabled={
                        !canManageStaff ||
                        (viewerOrgRole === "ORG_ADMIN" && user.orgRole === "ORG_OWNER") ||
                        (viewerOrgRole === "ORG_OWNER" && isLastOrgOwner(user))
                      }
                    >
                      <Text style={styles.manageButtonText}>{t("common.manage", { defaultValue: "Manage" })}</Text>
                    </TouchableOpacity>

                    {canRemoveFromOrg(user) && !isLastOrgOwner(user) && (
                      <TouchableOpacity
                        style={[styles.manageButton, styles.removeButton]}
                        onPress={() => openRemoveDialog(user)}
                        disabled={removing}
                      >
                        <Text style={[styles.manageButtonText, styles.removeButtonText]}>
                          {t("common.remove", { defaultValue: "Remove" })}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showBranchFilterModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowBranchFilterModal(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowBranchFilterModal(false)}>
          <Pressable style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{t("admin.staffManagement.selectBranch", { defaultValue: "Select Branch" })}</Text>
              <ScrollView style={styles.sheetScrollView} showsVerticalScrollIndicator>
                <TouchableOpacity
                  style={[styles.sheetItem, selectedBranchId === "" && styles.sheetItemActive]}
                  onPress={() => {
                    setSelectedBranchId("");
                    setShowBranchFilterModal(false);
                  }}
                >
                  <Text style={[styles.sheetItemText, selectedBranchId === "" && styles.sheetItemTextActive]}>
                    {t("admin.staffManagement.allBranches", { defaultValue: "All branches" })}
                  </Text>
                  {selectedBranchId === "" && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                </TouchableOpacity>

                {branches.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.sheetItem, selectedBranchId === b.id && styles.sheetItemActive]}
                    onPress={() => {
                      setSelectedBranchId(b.id);
                      setShowBranchFilterModal(false);
                    }}
                  >
                    <Text style={[styles.sheetItemText, selectedBranchId === b.id && styles.sheetItemTextActive]}>
                      {b.name}
                    </Text>
                    {selectedBranchId === b.id && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowBranchFilterModal(false)}>
                <Text style={styles.sheetCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showUserTypeFilterModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowUserTypeFilterModal(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowUserTypeFilterModal(false)}>
          <Pressable style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{t("admin.staffManagement.selectType", { defaultValue: "Select Type" })}</Text>

              <ScrollView style={styles.sheetScrollView} showsVerticalScrollIndicator>
                <TouchableOpacity
                  style={[styles.sheetItem, selectedUserType === "" && styles.sheetItemActive]}
                  onPress={() => {
                    setSelectedUserType("");
                    setShowUserTypeFilterModal(false);
                  }}
                >
                  <Text style={[styles.sheetItemText, selectedUserType === "" && styles.sheetItemTextActive]}>
                    {t("admin.staffManagement.allStaffTypes", { defaultValue: "All staff types" })}
                  </Text>
                  {selectedUserType === "" && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                </TouchableOpacity>

                {USER_TYPE_OPTIONS.map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    style={[styles.sheetItem, selectedUserType === o.value && styles.sheetItemActive]}
                    onPress={() => {
                      setSelectedUserType(o.value);
                      setShowUserTypeFilterModal(false);
                    }}
                  >
                    <Text style={[styles.sheetItemText, selectedUserType === o.value && styles.sheetItemTextActive]}>
                      {o.label}
                    </Text>
                    {selectedUserType === o.value && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowUserTypeFilterModal(false)}>
                <Text style={styles.sheetCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={removeDialogOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveDialogOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRemoveDialogOpen(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t("admin.staffManagement.removeTitle", { defaultValue: "Remove from organization" })}</Text>

            <Text style={styles.removeBodyText}>
              {t("admin.staffManagement.removeBody", {
                defaultValue: "Are you sure you want to remove this user from the organization?",
              })}
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setRemoveDialogOpen(false)} disabled={removing}>
                <Text style={styles.modalButtonCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, removing && { opacity: 0.6 }]}
                onPress={confirmRemoveFromOrg}
                disabled={removing || !removeTarget || (removeTarget ? isLastOrgOwner(removeTarget) : false)}
              >
                {removing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalButtonPrimaryText}>{t("common.remove", { defaultValue: "Remove" })}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={hireDialogOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHireDialogOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setHireDialogOpen(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t("admin.staffManagement.hireStaff", { defaultValue: "Hire staff" })}</Text>

            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="email" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder={t("admin.staffManagement.hireEmailPlaceholder", { defaultValue: "Enter email" })}
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                keyboardType="email-address"
                value={hireEmail}
                onChangeText={setHireEmail}
              />
            </View>

            <View style={styles.hireActionRow}>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setHireDialogOpen(false)} disabled={hireSearching || hireSaving}>
                <Text style={styles.modalButtonCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, (!hireEmail.trim() || hireSearching) && { opacity: 0.6 }]}
                onPress={searchHireCandidate}
                disabled={!hireEmail.trim() || hireSearching}
              >
                {hireSearching ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalButtonPrimaryText}>{t("common.search", { defaultValue: "Search" })}</Text>}
              </TouchableOpacity>
            </View>

            {hireCandidate ? (
              <View style={styles.hireCandidateCard}>
                <Text style={styles.hireCandidateName} numberOfLines={1}>
                  {`${hireCandidate.firstName || ""} ${hireCandidate.lastName || ""}`.trim() || hireCandidate.email}
                </Text>
                <Text style={styles.hireCandidateEmail} numberOfLines={1}>
                  {hireCandidate.email}
                </Text>
              </View>
            ) : null}

            <View style={styles.hireHireRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, (!hireCandidate || hireSaving) && { opacity: 0.6 }]}
                onPress={confirmHire}
                disabled={!hireCandidate || hireSaving}
              >
                {hireSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonPrimaryText}>
                    {t("admin.staffManagement.hireConfirm", { defaultValue: "Hire as org staff" })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
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
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  headerTextContainer: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
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
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  filterDropdown: {
    flex: 1,
    minWidth: 220,
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
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  toggleButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  toggleButtonTextActive: {
    color: "#fff",
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
    textAlign: "center",
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
  hireButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  hireButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
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
  userCardOwner: {
    borderColor: "rgba(251, 191, 36, 0.55)",
  },
  userCardAdmin: {
    borderColor: "rgba(147, 197, 253, 0.55)",
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
  orgRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: 8,
  },
  orgRoleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  orgOwnerBadge: {
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    borderColor: "rgba(251, 191, 36, 0.35)",
  },
  orgOwnerBadgeText: {
    color: "#FCD34D",
  },
  orgAdminBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    borderColor: "rgba(59, 130, 246, 0.35)",
  },
  orgAdminBadgeText: {
    color: "#93C5FD",
  },
  orgStaffBadge: {
    backgroundColor: "rgba(163, 163, 163, 0.12)",
    borderColor: "rgba(163, 163, 163, 0.35)",
  },
  orgStaffBadgeText: {
    color: "#E5E7EB",
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
    maxWidth: 260,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  manageButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  manageButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  removeButton: {
    backgroundColor: "#fee2e2",
    borderColor: "#ef4444",
  },
  removeButtonText: {
    color: "#ef4444",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  modalButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  modalButtonCancel: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
  },
  modalButtonCancelText: {
    color: "#374151",
    fontWeight: "700",
    fontSize: 12,
  },
  modalButtonPrimary: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  modalButtonPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  removeBodyText: {
    color: "#374151",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  hireCandidateCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    padding: 14,
  },
  hireCandidateName: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
  },
  hireCandidateEmail: {
    marginTop: 4,
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
  },
  hireActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  hireHireRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 12,
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
});
