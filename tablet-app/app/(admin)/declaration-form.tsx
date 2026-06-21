import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import ApiService from "@/src/services/apiService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

interface DeclarationFormData {
  name: string;
  type?: string | null;
  description?: string | null;
  icon?: string | null;
  shownInFilter?: boolean;
  excludedBranches?: string[];
}

interface Branch {
  id: string;
  name: string;
}

export default function DeclarationFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;
  const { getToken } = useAuthRole();
  const { canAny, isLoading: permissionsLoading } = usePermissions();
  const { selectedOrganizationId } = useOrganization();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const canViewDeclarations =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.VIEW }]);

  const canCreateDeclaration =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.CREATE }]);

  const canUpdateDeclaration =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.UPDATE }]);

  const handleScroll = useCallback((event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  }, [setScrollPosition, setScrollDirection]);

  const [formData, setFormData] = useState<DeclarationFormData>({
    name: "",
    type: null,
    description: "",
    icon: "",
    shownInFilter: true,
    excludedBranches: [],
  });
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  if (!permissionsLoading && !canViewDeclarations) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={
            isEditing
              ? t("admin.declarationManagement.editDeclaration")
              : t("admin.declarationManagement.createNewDeclaration")
          }
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <Text style={styles.loadingText}>
            {t("common.noPermission", { defaultValue: "You don't have permission." })}
          </Text>
          <TouchableOpacity
            style={[styles.cancelButton, { marginTop: 12 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>
              {t("common.back", { defaultValue: "Back" })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Emoji categories for picker
  const emojiCategories = {
    Dietary: [
      "🌱",
      "🥗",
      "🍃",
      "🌾",
      "🥛",
      "🥚",
      "🐟",
      "🐔",
      "🐄",
      "🐷",
      "🌿",
      "🥑",
      "🥦",
      "🥕",
      "🍅",
    ],
    Allergens: [
      "🥜",
      "🥛",
      "🥚",
      "🐟",
      "🦐",
      "🍞",
      "🌾",
      "🦀",
      "🐚",
      "🥥",
      "🌰",
    ],
    Labels: [
      "🌶️",
      "⚡",
      "🔥",
      "⭐",
      "💚",
      "🆕",
      "🏆",
      "✅",
      "❌",
      "💯",
      "🎯",
      "🔝",
      "💎",
      "✨",
      "🌟",
    ],
    Food: [
      "🍕",
      "🍔",
      "🍟",
      "🌮",
      "🌯",
      "🥙",
      "🍝",
      "🍜",
      "🍲",
      "🍛",
      "🍱",
      "🍣",
      "🍤",
      "🍗",
      "🍖",
    ],
    Drinks: ["☕", "🍵", "🥤", "🧃", "🍹", "🍷", "🍺", "🥂", "🍾", "🧊"],
    Other: [
      "❤️",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🧡",
      "💖",
      "💝",
      "🎉",
      "🎊",
      "🎈",
      "🎁",
      "🏅",
    ],
  };

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const authToken = token || undefined;
      const apiService = ApiService.getInstance();
      try {
        const result = await apiService.get("/api/admin/branches", authToken);
        if (result.success && result.data) {
          setBranches(result.data);
          return;
        }
      } catch (err: any) {
        const msg = String(err?.message || "");
        const isForbidden = msg.includes("status: 403");
        if (!isForbidden) {
          throw err;
        }
      }

      const fallbackResult = await apiService.get("/api/user/branches/my", authToken);
      if (fallbackResult.success && fallbackResult.data) {
        setBranches(fallbackResult.data);
      }
    } catch (error) {
      console.error("Error loading branches:", error);
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => {
    if (permissionsLoading) return;
    if (!canViewDeclarations) {
      router.back();
      return;
    }
    loadBranches();
    if (isEditing && params.id) {
      loadDeclaration(params.id);
    } else {
      setLoading(false);
    }
  }, [params.id, permissionsLoading, canViewDeclarations]);

  const loadDeclaration = async (id: string) => {
    try {
      setLoading(true);
      const token = await getToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (selectedOrganizationId) {
        headers["x-organization-id"] = String(selectedOrganizationId);
      }
      const res = await fetch(`${API_BASE_URL}/api/declarations/${id}`, {
        headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        const declaration = json.data;
        setFormData({
          name: declaration.name,
          type: declaration.type || null,
          description: declaration.description || "",
          icon: declaration.icon || "",
          shownInFilter:
            declaration.shownInFilter !== undefined
              ? declaration.shownInFilter
              : true,
          excludedBranches: declaration.excludedBranches || [],
        });
      }
    } catch (e) {
      console.error("Load declaration error:", e);
      setToast({
        visible: true,
        message: t("admin.declarationManagement.failedToLoad"),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setFormData({ ...formData, icon: emoji });
    setShowEmojiPicker(false);
  };

  const toggleExcludedBranch = (branchId: string) => {
    const currentExcludedBranches = formData.excludedBranches || [];
    const newExcludedBranches = currentExcludedBranches.includes(branchId)
      ? currentExcludedBranches.filter((id) => id !== branchId)
      : [...currentExcludedBranches, branchId];
    setFormData({
      ...formData,
      excludedBranches: newExcludedBranches,
    });
  };

  const handleSubmit = async () => {
    if (permissionsLoading) return;
    if (isEditing) {
      if (!canUpdateDeclaration) return;
    } else {
      if (!canCreateDeclaration) return;
    }

    if (!formData.name.trim()) {
      setToast({
        visible: true,
        message: t("admin.declarationManagement.nameRequired"),
        type: "error",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      if (isEditing && params.id) {
        // Update existing
        const res = await fetch(
          `${API_BASE_URL}/api/declarations/${params.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(formData),
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setToast({
          visible: true,
          message: t("admin.declarationManagement.updatedSuccess"),
          type: "success",
        });
      } else {
        // Create new
        const res = await fetch(`${API_BASE_URL}/api/declarations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setToast({
          visible: true,
          message: t("admin.declarationManagement.createdSuccess"),
          type: "success",
        });
      }
      setTimeout(() => router.back(), 400);
    } catch (e: any) {
      console.error("Error saving declaration:", e);
      setToast({
        visible: true,
        message: e.message || t("admin.declarationManagement.failedToSave"),
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={
            isEditing
              ? t("admin.declarationManagement.editDeclaration")
              : t("admin.declarationManagement.createNewDeclaration")
          }
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.declarationManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AnimatedHeader
        title={
          isEditing
            ? t("admin.declarationManagement.editDeclaration")
            : t("admin.declarationManagement.createNewDeclaration")
        }
        onBackPress={() => router.back()}
      />

      <ScrollView
        style={styles.form}
        contentContainerStyle={{ 
          paddingTop: headerHeight + 10,
          paddingBottom: 100 
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("admin.declarationManagement.declarationName")}{" "}
            <Text style={styles.required}>
              {t("admin.declarationManagement.required")}
            </Text>
          </Text>
          <TextInput
            style={styles.input}
            value={formData.name}
            onChangeText={(text) =>
              setFormData({ ...formData, name: text })
            }
            placeholder={t(
              "admin.declarationManagement.declarationNamePlaceholder"
            )}
            placeholderTextColor="#6B7280"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("admin.declarationManagement.declarationType")}
          </Text>
          <TextInput
            style={styles.input}
            value={formData.type || ""}
            onChangeText={(text) =>
              setFormData({ ...formData, type: text || null })
            }
            placeholder={t(
              "admin.declarationManagement.declarationTypePlaceholder"
            )}
            placeholderTextColor="#6B7280"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("admin.declarationManagement.descriptionLabel")}
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.description || ""}
            onChangeText={(text) =>
              setFormData({ ...formData, description: text })
            }
            placeholder={t(
              "admin.declarationManagement.descriptionPlaceholder"
            )}
            placeholderTextColor="#6B7280"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("admin.declarationManagement.iconLabel")}
          </Text>
          <TouchableOpacity
            onPress={() => setShowEmojiPicker(true)}
            style={styles.emojiInputContainer}
          >
            <Text
              style={[
                styles.emojiInputText,
                !formData.icon && styles.emojiInputPlaceholder,
              ]}
            >
              {formData.icon ||
                t("admin.declarationManagement.tapToSelectEmoji")}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color="#6B7280" />
          </TouchableOpacity>
          {formData.icon && (
            <TouchableOpacity
              onPress={() => setFormData({ ...formData, icon: "" })}
              style={styles.clearEmojiButton}
            >
              <Text style={styles.clearEmojiText}>
                {t("admin.declarationManagement.clear")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.inputGroup}>
          <View style={styles.switchContainer}>
            <View style={styles.switchLabelContainer}>
              <Text style={styles.label}>
                {t("admin.declarationManagement.showInFilter") ||
                  "Show in Filter"}
              </Text>
              <Text style={styles.switchDescription}>
                {t(
                  "admin.declarationManagement.showInFilterDescription"
                ) ||
                  "Display this declaration in the menu filter section"}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.switch,
                formData.shownInFilter !== false && styles.switchActive,
              ]}
              onPress={() =>
                setFormData({
                  ...formData,
                  shownInFilter: !(formData.shownInFilter !== false),
                })
              }
            >
              <View
                style={[
                  styles.switchThumb,
                  formData.shownInFilter !== false &&
                    styles.switchThumbActive,
                ]}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Excluded Branches Section */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("admin.declarationManagement.excludedBranches")}
          </Text>
          <Text style={styles.description}>
            {t("admin.declarationManagement.excludedBranchesDescription")}
          </Text>
          {loadingBranches ? (
            <View style={styles.branchesLoadingContainer}>
              <ActivityIndicator size="small" color="#ec4899" />
              <Text style={styles.branchesLoadingText}>
                {t("admin.declarationManagement.loadingBranches")}
              </Text>
            </View>
          ) : branches.length === 0 ? (
            <View style={styles.branchesEmptyContainer}>
              <Text style={styles.branchesEmptyText}>
                {t("admin.declarationManagement.noBranchesAvailable")}
              </Text>
            </View>
          ) : (
            <View style={styles.branchesContainer}>
              {branches.map((branch) => {
                const isExcluded = formData.excludedBranches?.includes(branch.id) || false;
                return (
                  <TouchableOpacity
                    key={branch.id}
                    style={[
                      styles.branchOption,
                      isExcluded && styles.branchOptionSelected,
                    ]}
                    onPress={() => toggleExcludedBranch(branch.id)}
                  >
                    <View style={styles.branchOptionContent}>
                      <View
                        style={[
                          styles.checkbox,
                          isExcluded && styles.checkboxSelected,
                        ]}
                      >
                        {isExcluded && (
                          <MaterialCommunityIcons
                            name="check"
                            size={12}
                            color="#fff"
                          />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.branchOptionText,
                          isExcluded && styles.branchOptionTextSelected,
                        ]}
                      >
                        {branch.name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {formData.excludedBranches && formData.excludedBranches.length > 0 && (
            <View style={styles.excludedBranchesSummary}>
              <Text style={styles.excludedBranchesSummaryText}>
                {t("admin.declarationManagement.branchesExcluded", {
                  count: formData.excludedBranches.length,
                })}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer Actions */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={isSubmitting}
        >
          <Text style={styles.cancelButtonText}>
            {t("admin.declarationManagement.cancel")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.submitButton,
            isSubmitting && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="check-circle" size={16} color="#fff" />
              <Text style={styles.submitButtonText}>
                {isSubmitting
                  ? isEditing
                    ? t("admin.declarationManagement.updating")
                    : t("admin.declarationManagement.creating")
                  : isEditing
                  ? t("admin.declarationManagement.update")
                  : t("admin.declarationManagement.create")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Emoji Picker Modal */}
      <Modal
        visible={showEmojiPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <View style={styles.emojiPickerOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowEmojiPicker(false)}
          />
          <View style={styles.emojiPickerModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("admin.declarationManagement.selectEmoji")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowEmojiPicker(false)}
                style={styles.modalCloseButton}
              >
                <MaterialCommunityIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.emojiPickerContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {Object.entries(emojiCategories).map(([category, emojis]) => (
                <View key={category} style={styles.emojiCategory}>
                  <Text style={styles.emojiCategoryTitle}>{category}</Text>
                  <View style={styles.emojiGrid}>
                    {emojis.map((emoji, index) => (
                      <TouchableOpacity
                        key={`${category}-${index}`}
                        style={styles.emojiItem}
                        onPress={() => handleEmojiSelect(emoji)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.emojiText}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#6b7280" },
  form: { flex: 1, padding: 16 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, color: "#111827", marginBottom: 8, fontWeight: "600" },
  required: { color: "#ef4444" },
  input: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 14,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  emojiInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    minHeight: 48,
  },
  emojiInputText: {
    fontSize: 20,
    color: "#111827",
    flex: 1,
  },
  emojiInputPlaceholder: {
    fontSize: 14,
    color: "#6B7280",
  },
  clearEmojiButton: {
    marginTop: 8,
    alignSelf: "flex-end",
  },
  clearEmojiText: {
    color: "#ec4899",
    fontSize: 12,
    fontWeight: "600",
  },
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  switchDescription: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  switch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    padding: 2,
  },
  switchActive: {
    backgroundColor: "#ec4899",
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  switchThumbActive: {
    alignSelf: "flex-end",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  submitButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  emojiPickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  emojiPickerModal: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    width: "100%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  modalCloseButton: {
    padding: 4,
  },
  emojiPickerContent: {
    padding: 16,
  },
  emojiCategory: {
    marginBottom: 24,
  },
  emojiCategoryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6b7280",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emojiItem: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  emojiText: {
    fontSize: 24,
  },
  description: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
    marginBottom: 12,
  },
  branchesLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 20,
  },
  branchesLoadingText: {
    fontSize: 12,
    color: "#6b7280",
  },
  branchesEmptyContainer: {
    padding: 20,
    alignItems: "center",
  },
  branchesEmptyText: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  branchesContainer: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#ffffff",
  },
  branchOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  branchOptionSelected: {
    backgroundColor: "rgba(236,72,153,0.08)",
    borderColor: "#ec4899",
  },
  branchOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  branchOptionText: {
    fontSize: 14,
    color: "#111827",
    flex: 1,
  },
  branchOptionTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  excludedBranchesSummary: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "rgba(236,72,153,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.25)",
  },
  excludedBranchesSummaryText: {
    fontSize: 12,
    color: "#6b7280",
  },
});

