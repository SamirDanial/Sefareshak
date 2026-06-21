import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import branchService from "@/src/services/branchService";
import {
  staffService,
  type OrgRole,
  type StaffRole,
  type StaffUser,
  type UserType,
} from "@/src/services/staffService";
import { Toast } from "@/components/Toast";

const USER_TYPE_OPTIONS: Array<{ value: UserType; label: string }> = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "BRANCH_ADMIN", label: "Branch Admin" },
  { value: "EMPLOYEE", label: "Employee" },
  { value: "WAITER", label: "Waiter" },
  { value: "USER", label: "User" },
];

const toggleInArray = (arr: string[], id: string) => {
  if (arr.includes(id)) return arr.filter((x) => x !== id);
  return [...arr, id];
};

export default function StaffUserScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const userId = typeof id === "string" ? id : "";

  const { getToken, userType: viewerUserType } = useAuthRole();
  const { rbacUser } = usePermissions();

  const viewerOrgRole = (rbacUser as any)?.orgRole as OrgRole | null | undefined;
  const currentUserId = (rbacUser as any)?.id as string | undefined;
  const isOrgOwnerViewer = viewerOrgRole === "ORG_OWNER";
  const isOrgAdminViewer = viewerOrgRole === "ORG_ADMIN";
  const isSuperAdminViewer = viewerUserType === "SUPER_ADMIN";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);

  const [activeUser, setActiveUser] = useState<StaffUser | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [editUserType, setEditUserType] = useState<UserType>("EMPLOYEE");
  const [editOrgRole, setEditOrgRole] = useState<OrgRole>("ORG_STAFF");
  const [editBranchIds, setEditBranchIds] = useState<string[]>([]);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);

  const [showUserTypeModal, setShowUserTypeModal] = useState(false);
  const [showOrgRoleModal, setShowOrgRoleModal] = useState(false);
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

  const isSuperAdminEdit = editUserType === "SUPER_ADMIN";
  const isWaiterEdit = editUserType === "WAITER";
  const isEmployeeEdit = editUserType === "EMPLOYEE";
  const canEditBranchesMulti = editUserType === "BRANCH_ADMIN";
  const canEditRoles = editUserType === "EMPLOYEE";

  const canEditStaffDetailsInOrgContext =
    (isOrgOwnerViewer || isOrgAdminViewer) &&
    editOrgRole === "ORG_STAFF" &&
    (!currentUserId || activeUser?.id !== currentUserId);

  const orgRoleOptions: Array<{ value: OrgRole; label: string }> = useMemo(() => {
    if (isOrgOwnerViewer) {
      if (activeUser?.orgRole === "ORG_OWNER") {
        return [
          { value: "ORG_OWNER", label: "ORG_OWNER" },
          { value: "ORG_ADMIN", label: "ORG_ADMIN" },
          { value: "ORG_STAFF", label: "ORG_STAFF" },
        ];
      }
      return [
        { value: "ORG_ADMIN", label: "ORG_ADMIN" },
        { value: "ORG_STAFF", label: "ORG_STAFF" },
      ];
    }
    if (isOrgAdminViewer) {
      return [
        { value: "ORG_ADMIN", label: "ORG_ADMIN" },
        { value: "ORG_STAFF", label: "ORG_STAFF" },
      ];
    }
    return [
      { value: "ORG_OWNER", label: "ORG_OWNER" },
      { value: "ORG_ADMIN", label: "ORG_ADMIN" },
      { value: "ORG_STAFF", label: "ORG_STAFF" },
    ];
  }, [activeUser?.orgRole, isOrgAdminViewer, isOrgOwnerViewer]);

  const selectedUserTypeLabel = useMemo(() => {
    return USER_TYPE_OPTIONS.find((o) => o.value === editUserType)?.label || editUserType;
  }, [editUserType]);

  const selectedBranchLabel = useMemo(() => {
    if (!editBranchIds[0]) return t("admin.staffManagement.selectBranch", { defaultValue: "Select branch" });
    return branches.find((b) => b.id === editBranchIds[0])?.name || editBranchIds[0];
  }, [branches, editBranchIds, t]);

  const isLastOrgOwner = (target?: StaffUser | null, list?: StaffUser[]) => {
    if (!target) return false;
    if (target.orgRole !== "ORG_OWNER") return false;
    const owners = (list || []).filter((u) => u.orgRole === "ORG_OWNER");
    return owners.length === 1 && owners[0]?.id === target.id;
  };

  const loadData = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const token = await getToken();

      const [staffUsers, branchList, roleList, userBranches, userRoles] = await Promise.all([
        staffService.getStaff({ includeInactive: true }, token || undefined),
        branchService.getBranches(token || undefined),
        staffService.getRoles(false, token || undefined),
        staffService.getUserBranches(userId, token || undefined),
        staffService.getUserRoles(userId, token || undefined),
      ]);

      setStaffUsers(staffUsers);

      const found = staffUsers.find((u) => u.id === userId) || null;
      setActiveUser(found);
      setEditOrgRole(((found as any)?.orgRole as OrgRole) || "ORG_STAFF");
      if (found) {
        const displayName =
          found.firstName && found.lastName
            ? `${found.firstName} ${found.lastName}`
            : found.firstName
            ? found.firstName
            : found.email.split("@")[0];
        router.setParams({ title: displayName });
      }

      setBranches(
        (branchList || []).map((b: any) => ({
          id: b.id,
          name: (b.name || b.code || b.id) as string,
        }))
      );
      setRoles(roleList.filter((r) => (r.isActive ?? true) === true));

      const currentType = (found?.userType || "EMPLOYEE") as UserType;
      setEditUserType(currentType);

      if (isOrgOwnerViewer && currentUserId && found && found.id === currentUserId) {
        setEditBranchIds([]);
        setEditRoleIds([]);
        return;
      }

      if (currentType === "SUPER_ADMIN") {
        setEditBranchIds([]);
        setEditRoleIds([]);
      } else {
        const branchIds = (userBranches || []).map((b) => b.id);
        setEditBranchIds(
          currentType === "WAITER" || currentType === "EMPLOYEE" ? (branchIds[0] ? [branchIds[0]] : []) : branchIds
        );

        setEditRoleIds(
          currentType === "WAITER"
            ? []
            : (userRoles || [])
                .map((r: any) => r.roleId || r.role?.id)
                .filter(Boolean)
        );
      }
    } catch (e) {
      console.error("Failed to load staff user", e);
      setToast({
        visible: true,
        message: t("admin.staffManagement.loadError", { defaultValue: "Failed to load staff data" }),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const save = async () => {
    if (!activeUser) return;

    try {
      setSaving(true);
      const token = await getToken();

      if (isSuperAdminViewer) {
        if (isLastOrgOwner(activeUser, staffUsers) && editOrgRole !== "ORG_OWNER") {
          setToast({
            visible: true,
            message: t("admin.staffManagement.lastOwnerRoleChangeBlocked", {
              defaultValue: "You can't change the organization role of the last ORG_OWNER",
            }),
            type: "error",
          });
          return;
        }

        await staffService.updateUserOrgRole(activeUser.id, editOrgRole, token || undefined);
        setToast({
          visible: true,
          message: t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }),
          type: "success",
        });
        router.back();
        return;
      }

      if (isOrgOwnerViewer || isOrgAdminViewer) {
        if (isOrgOwnerViewer) {
          if (currentUserId && activeUser.id === currentUserId) {
            setToast({
              visible: true,
              message: t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }),
              type: "success",
            });
            router.back();
            return;
          }

          if (activeUser.orgRole !== "ORG_OWNER" && editOrgRole === "ORG_OWNER") {
            setToast({
              visible: true,
              message: t("admin.staffManagement.ownerModifyOwnerBlocked", {
                defaultValue: "You can't modify another ORG_OWNER",
              }),
              type: "error",
            });
            return;
          }

          if (isLastOrgOwner(activeUser, staffUsers) && editOrgRole !== "ORG_OWNER") {
            setToast({
              visible: true,
              message: t("admin.staffManagement.lastOwnerRoleChangeBlocked", {
                defaultValue: "You can't change the organization role of the last ORG_OWNER",
              }),
              type: "error",
            });
            return;
          }

          await staffService.updateUserOrgRole(activeUser.id, editOrgRole, token || undefined);

          if (editOrgRole !== "ORG_STAFF") {
            setToast({
              visible: true,
              message: t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }),
              type: "success",
            });
            router.back();
            return;
          }

          if (editUserType === "BRANCH_ADMIN") {
            await Promise.all([
              staffService.updateUserType(activeUser.id, "BRANCH_ADMIN", token || undefined),
              staffService.setUserBranches(activeUser.id, editBranchIds, token || undefined),
              staffService.setUserRoles(activeUser.id, [], token || undefined),
            ]);
          } else {
            await Promise.all([
              staffService.updateUserType(activeUser.id, "EMPLOYEE", token || undefined),
              staffService.setUserBranches(activeUser.id, editBranchIds.slice(0, 1), token || undefined),
              staffService.setUserRoles(
                activeUser.id,
                editRoleIds.map((roleId) => ({ roleId, branchId: null })),
                token || undefined
              ),
            ]);
          }

          setToast({
            visible: true,
            message: t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }),
            type: "success",
          });
          router.back();
          return;
        }

        if (activeUser.orgRole === "ORG_OWNER") {
          setToast({
            visible: true,
            message: t("admin.staffManagement.ownerModifyOwnerBlocked", {
              defaultValue: "You can't modify another ORG_OWNER",
            }),
            type: "error",
          });
          return;
        }

        await staffService.updateUserOrgRole(activeUser.id, editOrgRole, token || undefined);

        if (editOrgRole === "ORG_ADMIN") {
          setToast({
            visible: true,
            message: t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }),
            type: "success",
          });
          router.back();
          return;
        }

        if (editUserType === "BRANCH_ADMIN") {
          await Promise.all([
            staffService.updateUserType(activeUser.id, "BRANCH_ADMIN", token || undefined),
            staffService.setUserBranches(activeUser.id, editBranchIds, token || undefined),
            staffService.setUserRoles(activeUser.id, [], token || undefined),
          ]);
        } else {
          await Promise.all([
            staffService.updateUserType(activeUser.id, "EMPLOYEE", token || undefined),
            staffService.setUserBranches(activeUser.id, editBranchIds.slice(0, 1), token || undefined),
            staffService.setUserRoles(
              activeUser.id,
              editRoleIds.map((roleId) => ({ roleId, branchId: null })),
              token || undefined
            ),
          ]);
        }

        setToast({
          visible: true,
          message: t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }),
          type: "success",
        });
        router.back();
        return;
      }

      if (isSuperAdminEdit) {
        await staffService.updateUserType(activeUser.id, editUserType, token || undefined);
      } else if (isWaiterEdit) {
        await Promise.all([
          staffService.updateUserType(activeUser.id, editUserType, token || undefined),
          staffService.setUserBranches(activeUser.id, editBranchIds.slice(0, 1), token || undefined),
          staffService.setUserRoles(activeUser.id, [], token || undefined),
        ]);
      } else if (editUserType === "BRANCH_ADMIN") {
        await Promise.all([
          staffService.updateUserType(activeUser.id, editUserType, token || undefined),
          staffService.setUserBranches(activeUser.id, editBranchIds, token || undefined),
          staffService.setUserRoles(activeUser.id, [], token || undefined),
        ]);
      } else {
        await Promise.all([
          staffService.updateUserType(activeUser.id, editUserType, token || undefined),
          staffService.setUserBranches(activeUser.id, editBranchIds.slice(0, 1), token || undefined),
          staffService.setUserRoles(
            activeUser.id,
            editRoleIds.map((roleId) => ({ roleId, branchId: null })),
            token || undefined
          ),
        ]);
      }

      setToast({
        visible: true,
        message: t("admin.staffManagement.savedSuccess", { defaultValue: "Saved successfully" }),
        type: "success",
      });
      router.back();
    } catch (e) {
      console.error("Failed to save staff user", e);
      setToast({
        visible: true,
        message: t("admin.staffManagement.saveError", { defaultValue: "Failed to save changes" }),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!userId) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Missing user id</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("common.loading", { defaultValue: "Loading..." })}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.headerIcon}>
              <MaterialCommunityIcons name="account-tie" size={18} color="#ec4899" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {t("admin.staffManagement.manageDialogTitle", { defaultValue: "Manage Staff" })}
              </Text>
              <Text style={styles.cardSubtitle} numberOfLines={2}>
                {activeUser?.email || userId}
              </Text>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>
              {t("admin.staffManagement.orgRole", { defaultValue: "Organization Role" })}
            </Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowOrgRoleModal(true)}
              disabled={
                isSuperAdminViewer
                  ? Boolean(activeUser) && isLastOrgOwner(activeUser, staffUsers)
                  : isOrgOwnerViewer
                  ? (Boolean(currentUserId) && activeUser?.id === currentUserId) ||
                    (Boolean(activeUser) && isLastOrgOwner(activeUser, staffUsers))
                  : activeUser?.orgRole === "ORG_OWNER"
              }
            >
              <Text style={styles.selectButtonText}>{editOrgRole}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {canEditStaffDetailsInOrgContext && (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t("admin.staffManagement.userType", { defaultValue: "User Type" })}</Text>
              <TouchableOpacity style={styles.selectButton} onPress={() => setShowUserTypeModal(true)}>
                <Text style={styles.selectButtonText}>{selectedUserTypeLabel}</Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {canEditStaffDetailsInOrgContext && !isSuperAdminEdit && (isWaiterEdit || isEmployeeEdit) && (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t("common.branch", { defaultValue: "Branch" })}</Text>
              <TouchableOpacity style={styles.selectButton} onPress={() => setShowBranchModal(true)}>
                <Text style={styles.selectButtonText}>{selectedBranchLabel}</Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {canEditStaffDetailsInOrgContext && !isSuperAdminEdit && canEditBranchesMulti && (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t("admin.staffManagement.branches", { defaultValue: "Branches" })}</Text>
              <View style={styles.checkboxList}>
                {branches.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.checkboxItem}
                    onPress={() => setEditBranchIds((prev) => toggleInArray(prev, b.id))}
                  >
                    <MaterialCommunityIcons
                      name={editBranchIds.includes(b.id) ? "checkbox-marked" : "checkbox-blank-outline"}
                      size={20}
                      color={editBranchIds.includes(b.id) ? "#ec4899" : "#9CA3AF"}
                    />
                    <Text style={styles.checkboxLabel}>{b.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {canEditStaffDetailsInOrgContext && !isSuperAdminEdit && canEditRoles && (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t("admin.staffManagement.roles", { defaultValue: "Roles" })}</Text>
              <View style={styles.checkboxList}>
                {roles.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={styles.checkboxItem}
                    onPress={() => setEditRoleIds((prev) => toggleInArray(prev, r.id))}
                  >
                    <MaterialCommunityIcons
                      name={editRoleIds.includes(r.id) ? "checkbox-marked" : "checkbox-blank-outline"}
                      size={20}
                      color={editRoleIds.includes(r.id) ? "#ec4899" : "#9CA3AF"}
                    />
                    <Text style={styles.checkboxLabel}>{r.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.formHint}>
                {t("admin.staffManagement.rolesAssignedGloballyNote", {
                  defaultValue: "Roles are currently assigned globally (not per-branch) in this UI.",
                })}
              </Text>
            </View>
          )}

          <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={save} disabled={saving || !activeUser}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveButtonText}>{t("common.save", { defaultValue: "Save" })}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showOrgRoleModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowOrgRoleModal(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowOrgRoleModal(false)}>
          <Pressable style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{t("admin.staffManagement.orgRole", { defaultValue: "Organization Role" })}</Text>
              <ScrollView style={styles.sheetScrollView} showsVerticalScrollIndicator>
                {orgRoleOptions.map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    style={[styles.sheetItem, editOrgRole === o.value && styles.sheetItemActive]}
                    onPress={() => {
                      const next = o.value;
                      setEditOrgRole(next);

                      if ((isOrgAdminViewer || isOrgOwnerViewer) && next !== "ORG_STAFF") {
                        setEditBranchIds([]);
                        setEditRoleIds([]);
                      }
                      if ((isOrgAdminViewer || isOrgOwnerViewer) && next === "ORG_STAFF") {
                        setEditUserType((prev) => (prev === "BRANCH_ADMIN" ? "BRANCH_ADMIN" : "EMPLOYEE"));
                      }

                      setShowOrgRoleModal(false);
                    }}
                  >
                    <Text style={[styles.sheetItemText, editOrgRole === o.value && styles.sheetItemTextActive]}>
                      {o.label}
                    </Text>
                    {editOrgRole === o.value && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowOrgRoleModal(false)}>
                <Text style={styles.sheetCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showUserTypeModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowUserTypeModal(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowUserTypeModal(false)}>
          <Pressable style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{t("admin.staffManagement.selectType", { defaultValue: "Select type" })}</Text>

              <ScrollView style={styles.sheetScrollView} showsVerticalScrollIndicator>
                {(isOrgOwnerViewer || isOrgAdminViewer
                  ? USER_TYPE_OPTIONS.filter((o) => o.value === "EMPLOYEE" || o.value === "BRANCH_ADMIN")
                  : USER_TYPE_OPTIONS.filter((o) => o.value !== "USER")
                ).map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    style={[styles.sheetItem, editUserType === o.value && styles.sheetItemActive]}
                    onPress={() => {
                      const next = o.value;
                      setEditUserType(next);
                      if (next === "SUPER_ADMIN") {
                        setEditBranchIds([]);
                        setEditRoleIds([]);
                      }
                      if (next === "WAITER" || next === "EMPLOYEE") {
                        setEditRoleIds([]);
                        setEditBranchIds((prev) => (prev[0] ? [prev[0]] : []));
                      }
                      if (next === "BRANCH_ADMIN") {
                        setEditRoleIds([]);
                      }
                      setShowUserTypeModal(false);
                    }}
                  >
                    <Text style={[styles.sheetItemText, editUserType === o.value && styles.sheetItemTextActive]}>
                      {o.label}
                    </Text>
                    {editUserType === o.value && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowUserTypeModal(false)}>
                <Text style={styles.sheetCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showBranchModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowBranchModal(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowBranchModal(false)}>
          <Pressable style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{t("admin.staffManagement.selectBranch", { defaultValue: "Select branch" })}</Text>

              <ScrollView style={styles.sheetScrollView} showsVerticalScrollIndicator>
                {branches.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.sheetItem, editBranchIds[0] === b.id && styles.sheetItemActive]}
                    onPress={() => {
                      setEditBranchIds([b.id]);
                      setShowBranchModal(false);
                    }}
                  >
                    <Text style={[styles.sheetItemText, editBranchIds[0] === b.id && styles.sheetItemTextActive]}>
                      {b.name}
                    </Text>
                    {editBranchIds[0] === b.id && <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowBranchModal(false)}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 32,
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
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  formHint: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 8,
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  selectButtonText: {
    fontSize: 14,
    color: "#374151",
  },
  checkboxList: {
    gap: 8,
  },
  checkboxItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  checkboxLabel: {
    fontSize: 14,
    color: "#374151",
  },
  saveButton: {
    backgroundColor: "#ec4899",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
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
