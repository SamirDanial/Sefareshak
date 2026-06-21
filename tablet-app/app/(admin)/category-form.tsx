import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Alert,
  Switch,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import {
  categoryService,
  type Category,
  type CategoryFormData,
} from "@/src/services/categoryService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import ApiService from "@/src/services/apiService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getOptimizedImageUrl = (imagePath: string): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

export default function CategoryFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;
  const { getToken } = useAuthRole();
  const { canAny, isLoading: permissionsLoading, refreshPermissions } = usePermissions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const refreshPermissionsRef = useRef(refreshPermissions);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  useEffect(() => {
    refreshPermissionsRef.current = refreshPermissions;
  }, [refreshPermissions]);

  const canViewCategories =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.VIEW }]);

  const canCreateCategory =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.CREATE }]);

  const canUpdateCategory =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.UPDATE }]);

  const canToggleCategory =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.TOGGLE_ACTIVE }]);

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

  const [formData, setFormData] = useState<
    Omit<CategoryFormData, "isActive" | "isFeatured"> & {
      id?: string;
      isActive?: boolean;
      isFeatured?: boolean;
    }
  >({
    name: "",
    description: "",
    image: undefined,
    excludedBranches: [],
  });
  const [taxText, setTaxText] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  useEffect(() => {
    (async () => {
      const cameraPermission =
        await ImagePicker.requestCameraPermissionsAsync();
      const mediaPermission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!cameraPermission.granted || !mediaPermission.granted) {
        Alert.alert(
          t("admin.categoryManagement.permissionsRequired"),
          t("admin.categoryManagement.grantPermissions")
        );
      }
    })();
  }, []);

  useEffect(() => {
    loadBranches();
    if (isEditing && params.id) {
      loadCategory(params.id);
    } else {
      setLoading(false);
    }
  }, [params.id]);

  useFocusEffect(
    React.useCallback(() => {
      refreshPermissionsRef.current();
    }, [])
  );

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

  const loadCategory = async (id: string) => {
    try {
      setLoading(true);
      const token = await getToken();
      const cat = await categoryService.getCategoryById(id, token || undefined);
      setFormData({
        id: cat.id,
        name: cat.name,
        description: cat.description || "",
        image: cat.image || undefined,
        isActive: cat.isActive,
        isFeatured: cat.isFeatured !== undefined ? cat.isFeatured : false,
        taxPercentage: cat.taxPercentage,
        excludedBranches: (cat as any).excludedBranches || [],
      });
      setTaxText(cat.taxPercentage != null ? String(cat.taxPercentage) : "");
    } catch (e) {
      console.error("Load category error:", e);
      setToast({
        visible: true,
        message: t("admin.categoryManagement.loadCategoryError"),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
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

  const handlePickImage = async (mode: "library" | "camera") => {
    try {
      setShowImagePickerModal(false);
      let result;
      if (mode === "camera") {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      }
      if (!result.canceled && result.assets[0]) {
        await handleEditAndUploadImage(result.assets[0].uri);
      }
    } catch (e) {
      console.error("Pick image error:", e);
      setToast({
        visible: true,
        message: t("admin.categoryManagement.pickImageError"),
        type: "error",
      });
    }
  };

  const handleEditAndUploadImage = async (imageUri: string) => {
    try {
      setIsUploadingImage(true);
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      await uploadImageToServer(manipulated.uri);
    } catch (e) {
      console.error("Edit/upload image error:", e);
      setToast({
        visible: true,
        message: t("admin.categoryManagement.processImageError"),
        type: "error",
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const uploadImageToServer = async (imageUri: string) => {
    const token = await getToken();
    const uploadFormData = new FormData();
    const filename = imageUri.split("/").pop() || `category_${Date.now()}.jpg`;
    const match = /(\.\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : "image/jpeg";
    // @ts-ignore RN FormData
    uploadFormData.append("image", {
      uri: imageUri,
      name: filename,
      type,
    } as any);
    const res = await fetch(`${API_BASE_URL}/api/upload/image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: uploadFormData,
    });
    if (!res.ok) throw new Error(`Upload failed ${res.status}`);
    const data = await res.json();
    if (data.success && data.data) {
      setFormData((prev) => ({ ...prev, image: data.data.filename }));
      setToast({
        visible: true,
        message: t("admin.categoryManagement.imageUploaded"),
        type: "success",
      });
    } else {
      throw new Error("Invalid response");
    }
  };

  const handleSubmit = async () => {
    if (!canViewCategories) {
      setToast({
        visible: true,
        message: t("common.noPermission", { defaultValue: "You don't have permission." }),
        type: "error",
      });
      return;
    }

    if (isEditing && !canUpdateCategory) {
      setToast({
        visible: true,
        message: t("common.noPermission", { defaultValue: "You don't have permission." }),
        type: "error",
      });
      return;
    }

    if (!isEditing && !canCreateCategory) {
      setToast({
        visible: true,
        message: t("common.noPermission", { defaultValue: "You don't have permission." }),
        type: "error",
      });
      return;
    }

    if (!formData.name.trim()) {
      setToast({
        visible: true,
        message: t("admin.categoryManagement.nameRequired"),
        type: "error",
      });
      return;
    }
    try {
      setIsSubmitting(true);
      const token = await getToken();
      if (formData.id) {
        await categoryService.updateCategory(
          formData.id,
          {
            name: formData.name.trim(),
            description: formData.description || "",
            image: formData.image,
            taxPercentage: formData.taxPercentage ?? null,
            isActive: formData.isActive,
            isFeatured:
              formData.isFeatured !== undefined ? formData.isFeatured : false,
            excludedBranches: formData.excludedBranches || [],
          },
          token || undefined
        );
        setToast({
          visible: true,
          message: t("admin.categoryManagement.categoryUpdated"),
          type: "success",
        });
      } else {
        await categoryService.createCategory(
          {
            name: formData.name.trim(),
            description: formData.description || "",
            image: formData.image,
            taxPercentage: formData.taxPercentage ?? null,
            isActive: formData.isActive ?? true,
            isFeatured:
              formData.isFeatured !== undefined ? formData.isFeatured : false,
            excludedBranches: formData.excludedBranches || [],
          },
          token || undefined
        );
        setToast({
          visible: true,
          message: t("admin.categoryManagement.categoryCreated"),
          type: "success",
        });
      }
      setTimeout(() => router.back(), 400);
    } catch (e) {
      console.error("Save category error:", e);
      setToast({
        visible: true,
        message: t("admin.categoryManagement.saveCategoryError"),
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!permissionsLoading && !canViewCategories) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("admin.categoryManagement.title", { defaultValue: "Categories" })}
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <Text style={styles.loadingText}>
            {t("common.noPermission", { defaultValue: "You don't have permission." })}
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={
            isEditing
              ? t("admin.categoryManagement.editCategory")
              : t("admin.categoryManagement.createCategory")
          }
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.categoryManagement.loading")}
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
            ? t("admin.categoryManagement.editCategory")
            : t("admin.categoryManagement.createCategory")
        }
        onBackPress={() => router.back()}
      />

      <ScrollView
        style={styles.form}
        contentContainerStyle={{ paddingTop: headerHeight + 10, paddingBottom: 100 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("admin.categoryManagement.name")}{" "}
            <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t("admin.categoryManagement.namePlaceholder")}
            placeholderTextColor="#6B7280"
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("admin.categoryManagement.description")}
          </Text>
          <TextInput
            style={styles.textArea}
            placeholder={t("admin.categoryManagement.descriptionPlaceholder")}
            placeholderTextColor="#6B7280"
            value={formData.description || ""}
            onChangeText={(text) =>
              setFormData({ ...formData, description: text })
            }
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Tax Percentage */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("admin.categoryManagement.taxPercentage")}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t("admin.categoryManagement.taxPercentagePlaceholder")}
            placeholderTextColor="#6B7280"
            keyboardType="decimal-pad"
            value={taxText}
            onChangeText={(text) => {
              let cleaned = text.replace(/[^0-9.]/g, "");
              const parts = cleaned.split(".");
              if (parts.length > 2)
                cleaned = parts[0] + "." + parts.slice(1).join("");
              setTaxText(cleaned);
              if (cleaned === "" || cleaned === ".") {
                setFormData({ ...formData, taxPercentage: null });
              } else {
                const num = parseFloat(cleaned);
                if (!isNaN(num))
                  setFormData({ ...formData, taxPercentage: num });
              }
            }}
          />
        </View>

        {/* Active Toggle */}
        <View style={styles.formGroupRow}>
          <Text style={styles.label}>
            {t("admin.categoryManagement.active")}
          </Text>
          <Switch
            value={!!formData.isActive}
            onValueChange={(v) => setFormData({ ...formData, isActive: v })}
            trackColor={{ true: "#ec4899", false: "#e5e7eb" }}
            thumbColor="#fff"
          />
        </View>

        {/* Featured Toggle */}
        <View style={styles.formGroupRow}>
          <View style={styles.switchLabelContainer}>
            <Text style={styles.label}>
              {t("admin.categoryManagement.isFeatured") || "Featured on Home"}
            </Text>
            <Text style={styles.switchDescription}>
              {t("admin.categoryManagement.isFeaturedDescription") ||
                "Show this category on the home page"}
            </Text>
          </View>
          <Switch
            value={!!formData.isFeatured}
            onValueChange={(v) => setFormData({ ...formData, isFeatured: v })}
            trackColor={{ true: "#ec4899", false: "#e5e7eb" }}
            thumbColor="#fff"
          />
        </View>

        {/* Excluded Branches Section */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("admin.categoryManagement.excludedBranches")}
          </Text>
          <Text style={styles.hintText}>
            {t("admin.categoryManagement.excludedBranchesDescription")}
          </Text>
          {loadingBranches ? (
            <View style={styles.branchesLoadingContainer}>
              <ActivityIndicator size="small" color="#ec4899" />
              <Text style={styles.branchesLoadingText}>
                {t("admin.categoryManagement.loadingBranches") || "Loading branches..."}
              </Text>
            </View>
          ) : branches.length === 0 ? (
            <View style={styles.branchesEmptyContainer}>
              <Text style={styles.branchesEmptyText}>
                {t("admin.categoryManagement.noBranchesAvailable") || "No branches available"}
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
                {t("admin.categoryManagement.branchesExcluded", {
                  count: formData.excludedBranches.length,
                }) || `${formData.excludedBranches.length} branch(es) excluded`}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("admin.categoryManagement.image")}
          </Text>
          {formData.image ? (
            <View style={styles.imagePreview}>
              <Image
                source={{ uri: getOptimizedImageUrl(formData.image) }}
                style={styles.imagePreviewImage}
                resizeMode="cover"
              />
              <View style={styles.imagePreviewActions}>
                <TouchableOpacity
                  style={styles.changeImageButton}
                  onPress={() => setShowImagePickerModal(true)}
                  disabled={isUploadingImage}
                >
                  <EditIcon size={14} color="#fff" />
                  <Text style={styles.changeImageButtonText}>
                    {t("admin.categoryManagement.change")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setFormData({ ...formData, image: undefined })}
                  disabled={isUploadingImage}
                >
                  <MaterialCommunityIcons name="delete" size={14} color="#fff" />
                  <Text style={styles.removeImageButtonText}>
                    {t("admin.categoryManagement.remove")}
                  </Text>
                </TouchableOpacity>
              </View>
              {isUploadingImage && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color="#ec4899" />
                  <Text style={styles.uploadingText}>
                    {t("admin.categoryManagement.processingImage")}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.imagePickerContainer}>
              <TouchableOpacity
                style={styles.imagePickerButton}
                onPress={() => setShowImagePickerModal(true)}
                disabled={isUploadingImage}
              >
                <MaterialCommunityIcons name="camera" size={24} color="#ec4899" />
                <Text style={styles.imagePickerButtonText}>
                  {t("admin.categoryManagement.addCategoryImage")}
                </Text>
              </TouchableOpacity>
              <Text style={styles.imagePickerHint}>
                {t("admin.categoryManagement.chooseFromLibraryOrPhoto")}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer with Cancel and Save buttons */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={isSubmitting}
        >
          <Text style={styles.cancelButtonText}>
            {t("admin.categoryManagement.cancel") || "Cancel"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="check" size={16} color="#fff" />
              <Text style={styles.saveButtonText}>
                {isEditing
                  ? t("admin.categoryManagement.update")
                  : t("admin.categoryManagement.create")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Image Picker Modal */}
      <Modal
        visible={showImagePickerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowImagePickerModal(false)}
      >
        <Pressable
          style={styles.imagePickerModalContainer}
          onPress={() => setShowImagePickerModal(false)}
        >
          <Pressable
            style={styles.imagePickerModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.imagePickerModalHeader}>
              <Text style={styles.imagePickerModalTitle}>
                {t("admin.categoryManagement.selectImage")}
              </Text>
              <TouchableOpacity onPress={() => setShowImagePickerModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <View style={styles.imagePickerOptions}>
              <TouchableOpacity
                style={styles.imagePickerOption}
                onPress={() => handlePickImage("library")}
              >
                <View style={styles.imagePickerOptionIcon}>
                  <MaterialCommunityIcons name="image" size={32} color="#ec4899" />
                </View>
                <View style={styles.imagePickerOptionText}>
                  <Text style={styles.imagePickerOptionTitle}>
                    {t("admin.categoryManagement.chooseFromLibrary")}
                  </Text>
                  <Text style={styles.imagePickerOptionSubtitle}>
                    {t("admin.categoryManagement.selectExistingPhoto")}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.imagePickerOption}
                onPress={() => handlePickImage("camera")}
              >
                <View style={styles.imagePickerOptionIcon}>
                  <MaterialCommunityIcons name="camera" size={32} color="#ec4899" />
                </View>
                <View style={styles.imagePickerOptionText}>
                  <Text style={styles.imagePickerOptionTitle}>
                    {t("admin.categoryManagement.takePhoto")}
                  </Text>
                  <Text style={styles.imagePickerOptionSubtitle}>
                    {t("admin.categoryManagement.captureNewPhoto")}
                  </Text>
                </View>
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
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingTop: 20,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ec4899",
    flex: 1,
    textAlign: "center",
  },
  headerRight: { width: 32 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#6b7280" },
  form: { flex: 1, padding: 16 },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 14, color: "#111827", marginBottom: 8, fontWeight: "600" },
  required: { color: "#ef4444" },
  input: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 14,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  textArea: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 14,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    minHeight: 100,
    textAlignVertical: "top",
  },
  formGroupRow: {
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  hintText: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 12,
    lineHeight: 16,
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
    color: "#9ca3af",
    textAlign: "center",
  },
  branchesContainer: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#f9fafb",
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
    backgroundColor: "#f9fafb",
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
    borderColor: "#6B7280",
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
    color: "#111827",
    fontWeight: "600",
  },
  excludedBranchesSummary: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  excludedBranchesSummaryText: {
    fontSize: 12,
    color: "#6b7280",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
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
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ec4899",
    paddingVertical: 14,
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },

  imagePickerContainer: { marginTop: 12, alignItems: "center" },
  imagePickerButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 2,
    borderColor: "#ec4899",
    borderStyle: "dashed",
  },
  imagePickerButtonText: { fontSize: 16, fontWeight: "600", color: "#ec4899" },
  imagePickerHint: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 8,
    textAlign: "center",
  },
  imagePreview: {
    marginTop: 12,
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  imagePreviewImage: { width: "100%", height: "100%" },
  imagePreviewActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 8,
    padding: 12,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  changeImageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  changeImageButtonText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  removeImageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#ef4444",
  },
  removeImageButtonText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  uploadingText: { fontSize: 14, color: "#fff", fontWeight: "500" },

  imagePickerModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  imagePickerModalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  imagePickerModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  imagePickerModalTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  imagePickerOptions: { gap: 16 },
  imagePickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  imagePickerOptionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePickerOptionText: { flex: 1 },
  imagePickerOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  imagePickerOptionSubtitle: { fontSize: 13, color: "#6b7280" },
});
