import React, { useState, useEffect, useRef } from "react";
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
  Switch,
  Modal,
  Pressable,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import ApiService from "@/src/services/apiService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

interface HeroSection {
  id: string;
  badgeText: string | null;
  title: string;
  subtitle: string | null;
  backgroundImage: string | null;
  primaryButtonText: string | null;
  primaryButtonLink: string | null;
  secondaryButtonText: string | null;
  secondaryButtonLink: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface HeroSectionFormData {
  badgeText?: string;
  title: string;
  subtitle?: string;
  backgroundImage?: string;
  primaryButtonText?: string;
  primaryButtonLink?: string;
  secondaryButtonText?: string;
  secondaryButtonLink?: string;
  isActive?: boolean;
}

const getOptimizedImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

export default function HeroSectionScreen() {
  const { t } = useTranslation();
  const { getToken, userType } = useAuthRole();
  const { canAny, refreshPermissions } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();
  const [heroSection, setHeroSection] = useState<HeroSection | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const [scope, setScope] = useState<"organization" | "global">("organization");

  const [formData, setFormData] = useState<HeroSectionFormData>({
    badgeText: "",
    title: "",
    subtitle: "",
    backgroundImage: "",
    primaryButtonText: "",
    primaryButtonLink: "",
    secondaryButtonText: "",
    secondaryButtonLink: "",
    isActive: true,
  });

  const canManageHeroSection = canAny([
    { resource: RESOURCES.HERO_SECTIONS, action: ACTIONS.UPDATE },
    { resource: RESOURCES.HERO_SECTIONS, action: ACTIONS.MANAGE },
  ]);

  const resetForm = () => {
    setHeroSection(null);
    setFormData({
      badgeText: "",
      title: "",
      subtitle: "",
      backgroundImage: "",
      primaryButtonText: "",
      primaryButtonLink: "",
      secondaryButtonText: "",
      secondaryButtonLink: "",
      isActive: true,
    });
  };

  useEffect(() => {
    if (organizationLoading) return;
    // Scope switching (and org switching when scope is organization) should reset form to avoid stale UI.
    resetForm();
    fetchHeroSection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, selectedOrganizationId, organizationLoading]);

  const fetchHeroSection = async () => {
    try {
      if (!refreshing) {
      setLoading(true);
      }
      const token = await getToken();
      let json: any;
      if (scope === "global") {
        // Global/application scope should not include x-organization-id.
        const res = await fetch(`${API_BASE_URL}/api/hero-section`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        json = await res.json();
      } else {
        if (organizationLoading) return;
        refreshPermissions();
        const apiService = ApiService.getInstance();
        json = await apiService.get("/api/hero-section", token || undefined);
      }
      if (json.success && json.data) {
        const heroSections = json.data;
        if (heroSections.length > 0) {
          const activeSection =
            heroSections.find((h: HeroSection) => h.isActive) ||
            heroSections[0];
          setHeroSection(activeSection);
          setFormData({
            badgeText: activeSection.badgeText || "",
            title: activeSection.title || "",
            subtitle: activeSection.subtitle || "",
            backgroundImage: activeSection.backgroundImage || "",
            primaryButtonText: activeSection.primaryButtonText || "",
            primaryButtonLink: activeSection.primaryButtonLink || "",
            secondaryButtonText: activeSection.secondaryButtonText || "",
            secondaryButtonLink: activeSection.secondaryButtonLink || "",
            isActive: activeSection.isActive,
          });
        }
      }
    } catch (e) {
      console.error("Error fetching hero section:", e);
      setToast({
        visible: true,
        message: t("admin.heroSection.error.fetching"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHeroSection();
  };

  const handlePickImage = async (mode: "library" | "camera") => {
    try {
      setShowImagePickerModal(false);
      let result;

      if (mode === "camera") {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [16, 9],
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [16, 9],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets[0]) {
        await handleEditAndUploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      setToast({
        visible: true,
        message: t("admin.heroSection.error.pickImage"),
        type: "error",
      });
    }
  };

  const handleEditAndUploadImage = async (imageUri: string) => {
    try {
      setIsUploadingImage(true);
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1920 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      await uploadImageToServer(manipulated.uri);
    } catch (e) {
      console.error("Edit/upload image error:", e);
      setToast({
        visible: true,
        message: t("admin.heroSection.error.processImage"),
        type: "error",
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const uploadImageToServer = async (imageUri: string) => {
    const token = await getToken();
    const uploadFormData = new FormData();
    const filename = imageUri.split("/").pop() || `hero_${Date.now()}.jpg`;
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
      setFormData((prev) => ({ ...prev, backgroundImage: data.data.filename }));
      setToast({
        visible: true,
        message: t("admin.heroSection.success.imageUploaded"),
        type: "success",
      });
    } else {
      throw new Error("Invalid response");
    }
  };

  const handleSubmit = async () => {
    if (!canManageHeroSection) {
      setToast({
        visible: true,
        message: t("common.accessDenied") || "Access denied",
        type: "error",
      });
      return;
    }
    if (!formData.title.trim()) {
      setToast({
        visible: true,
        message: t("admin.heroSection.error.titleRequired"),
        type: "error",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      if (heroSection) {
        // Update existing
        if (scope === "global") {
          const res = await fetch(
            `${API_BASE_URL}/api/hero-section/${heroSection.id}`,
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
        } else {
          const apiService = ApiService.getInstance();
          await apiService.put(
            `/api/hero-section/${heroSection.id}`,
            formData,
            token || undefined
          );
        }
        setToast({
          visible: true,
          message: t("admin.heroSection.success.updated"),
          type: "success",
        });
      } else {
        // Create new
        if (scope === "global") {
          const res = await fetch(`${API_BASE_URL}/api/hero-section`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(formData),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          if (json.success && json.data) {
            setHeroSection(json.data);
            setToast({
              visible: true,
              message: t("admin.heroSection.success.created"),
              type: "success",
            });
          }
        } else {
          const apiService = ApiService.getInstance();
          const json: any = await apiService.post(
            "/api/hero-section",
            formData,
            token || undefined
          );
          if (json.success && json.data) {
            setHeroSection(json.data);
            setToast({
              visible: true,
              message: t("admin.heroSection.success.created"),
              type: "success",
            });
          }
        }
      }

      await fetchHeroSection();
    } catch (e: any) {
      console.error("Error saving hero section:", e);
      setToast({
        visible: true,
        message: e.message || t("admin.heroSection.error.saving"),
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Only show full-screen loader when loading and no data exists
  const hasData = heroSection !== null || formData.title !== "";
  if (loading && !hasData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>{t("admin.heroSection.loading")}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
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
        {userType === "SUPER_ADMIN" && (
          <View style={styles.scopeTabsRow}>
            <TouchableOpacity
              style={[styles.scopeTab, scope === "global" ? styles.scopeTabActive : styles.scopeTabInactive]}
              onPress={() => setScope("global")}
              disabled={loading || isSubmitting}
            >
              <Text style={[styles.scopeTabText, scope === "global" && styles.scopeTabTextActive]}>
                {t("admin.heroSection.scope.global")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.scopeTab, scope === "organization" ? styles.scopeTabActive : styles.scopeTabInactive]}
              onPress={() => setScope("organization")}
              disabled={loading || isSubmitting}
            >
              <Text style={[styles.scopeTabText, scope === "organization" && styles.scopeTabTextActive]}>
                {t("admin.heroSection.scope.organization")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="image" size={20} color="#ec4899" />
            <Text style={styles.cardTitle}>{t("admin.heroSection.title")}</Text>
          </View>
          <Text style={styles.cardDescription}>
            {t("admin.heroSection.description")}
          </Text>
          <View style={styles.cardBody}>
            {/* Badge Text */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("admin.heroSection.badgeText")}
              </Text>
              <TextInput
                style={styles.input}
                value={formData.badgeText}
                onChangeText={(text) =>
                  setFormData({ ...formData, badgeText: text })
                }
                placeholder={t("admin.heroSection.badgeTextPlaceholder")}
                placeholderTextColor="#6B7280"
                editable={canManageHeroSection}
              />
            </View>

            {/* Title */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("admin.heroSection.titleLabel")}{" "}
                <Text style={styles.required}>
                  {t("admin.heroSection.required")}
                </Text>
              </Text>
              <TextInput
                style={styles.input}
                value={formData.title}
                onChangeText={(text) =>
                  setFormData({ ...formData, title: text })
                }
                placeholder={t("admin.heroSection.titlePlaceholder")}
                placeholderTextColor="#6B7280"
                editable={canManageHeroSection}
              />
            </View>

            {/* Subtitle */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("admin.heroSection.subtitle")}
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.subtitle}
                onChangeText={(text) =>
                  setFormData({ ...formData, subtitle: text })
                }
                placeholder={t("admin.heroSection.subtitlePlaceholder")}
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={3}
                editable={canManageHeroSection}
              />
            </View>

            {/* Background Image */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("admin.heroSection.backgroundImage")}
              </Text>
              <TouchableOpacity
                style={styles.imageButton}
                onPress={() => setShowImagePickerModal(true)}
                disabled={!canManageHeroSection || isUploadingImage}
              >
                {isUploadingImage ? (
                  <ActivityIndicator size="small" color="#ec4899" />
                ) : (
                  <MaterialCommunityIcons name="image" size={16} color="#ec4899" />
                )}
                <Text style={styles.imageButtonText}>
                  {isUploadingImage
                    ? t("admin.heroSection.uploading")
                    : formData.backgroundImage
                    ? t("admin.heroSection.changeImage")
                    : t("admin.heroSection.selectImage")}
                </Text>
              </TouchableOpacity>
              {formData.backgroundImage && (
                <View style={styles.imagePreview}>
                  <Image
                    source={{
                      uri: getOptimizedImageUrl(formData.backgroundImage),
                    }}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                </View>
              )}
            </View>

            {/* Primary Button */}
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionTitle}>
              {t("admin.heroSection.primaryButton")}
            </Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("admin.heroSection.buttonText")}
              </Text>
              <TextInput
                style={styles.input}
                value={formData.primaryButtonText}
                onChangeText={(text) =>
                  setFormData({ ...formData, primaryButtonText: text })
                }
                placeholder={t(
                  "admin.heroSection.primaryButtonTextPlaceholder"
                )}
                placeholderTextColor="#6B7280"
                editable={canManageHeroSection}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("admin.heroSection.buttonLink")}
              </Text>
              <TextInput
                style={styles.input}
                value={formData.primaryButtonLink}
                onChangeText={(text) =>
                  setFormData({ ...formData, primaryButtonLink: text })
                }
                placeholder={t(
                  "admin.heroSection.primaryButtonLinkPlaceholder"
                )}
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                autoCorrect={false}
                editable={canManageHeroSection}
              />
            </View>

            {/* Secondary Button */}
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionTitle}>
              {t("admin.heroSection.secondaryButton")}
            </Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("admin.heroSection.buttonText")}
              </Text>
              <TextInput
                style={styles.input}
                value={formData.secondaryButtonText}
                onChangeText={(text) =>
                  setFormData({ ...formData, secondaryButtonText: text })
                }
                placeholder={t(
                  "admin.heroSection.secondaryButtonTextPlaceholder"
                )}
                placeholderTextColor="#6B7280"
                editable={canManageHeroSection}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("admin.heroSection.buttonLink")}
              </Text>
              <TextInput
                style={styles.input}
                value={formData.secondaryButtonLink}
                onChangeText={(text) =>
                  setFormData({ ...formData, secondaryButtonLink: text })
                }
                placeholder={t(
                  "admin.heroSection.secondaryButtonLinkPlaceholder"
                )}
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                autoCorrect={false}
                editable={canManageHeroSection}
              />
            </View>

            {/* Active Status */}
            <View style={styles.sectionDivider} />
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  {t("admin.heroSection.isActive")}
                </Text>
                <Text style={styles.helpText}>
                  {t("admin.heroSection.isActiveDescription")}
                </Text>
              </View>
              <Switch
                value={formData.isActive}
                onValueChange={(value) =>
                  setFormData({ ...formData, isActive: value })
                }
                disabled={!canManageHeroSection}
              />
            </View>

            {/* Preview */}
            {formData.backgroundImage && (
              <>
                <View style={styles.sectionDivider} />
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    {t("admin.heroSection.preview")}
                  </Text>
                  <View style={styles.previewContainer}>
                    <Image
                      source={{
                        uri: getOptimizedImageUrl(formData.backgroundImage),
                      }}
                      style={styles.previewHeroImage}
                      resizeMode="cover"
                    />
                    <View style={styles.previewOverlay} />
                    <View style={styles.previewContent}>
                      {formData.badgeText && (
                        <View style={styles.previewBadge}>
                          <Text style={styles.previewBadgeText}>
                            {formData.badgeText}
                          </Text>
                        </View>
                      )}
                      {formData.title && (
                        <Text style={styles.previewTitle}>
                          {formData.title}
                        </Text>
                      )}
                      {formData.subtitle && (
                        <Text style={styles.previewSubtitle}>
                          {formData.subtitle}
                        </Text>
                      )}
                      <View style={styles.previewButtons}>
                        {formData.primaryButtonText && (
                          <View style={styles.previewButtonPrimary}>
                            <Text style={styles.previewButtonText}>
                              {formData.primaryButtonText}
                            </Text>
                          </View>
                        )}
                        {formData.secondaryButtonText && (
                          <View style={styles.previewButtonSecondary}>
                            <Text style={styles.previewButtonText}>
                              {formData.secondaryButtonText}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              </>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (isSubmitting || !canManageHeroSection) && styles.submitButtonDisabled,
              ]}
              onPress={canManageHeroSection ? handleSubmit : undefined}
              disabled={isSubmitting || !canManageHeroSection}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="check" size={16} color="#fff" />
              )}
              <Text style={styles.submitButtonText}>
                {isSubmitting
                  ? t("admin.heroSection.saving")
                  : t("admin.heroSection.save")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Image Picker Modal */}
      <Modal
        visible={showImagePickerModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowImagePickerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowImagePickerModal(false)} />
          <View style={[styles.modalContent, { paddingBottom: Math.max(12, insets.bottom + 12) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("admin.heroSection.selectImageTitle")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowImagePickerModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialCommunityIcons name="close" size={20} color="#111827" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => handlePickImage("library")}
              >
                <MaterialCommunityIcons
                  name="image-multiple"
                  size={24}
                  color="#ec4899"
                />
                <Text style={styles.modalOptionText}>
                  {t("admin.heroSection.chooseFromLibrary")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => handlePickImage("camera")}
              >
                <MaterialCommunityIcons name="camera" size={24} color="#ec4899" />
                <Text style={styles.modalOptionText}>
                  {t("admin.heroSection.takePhoto")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#6b7280" },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  scopeTabsRow: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  scopeTab: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  scopeTabActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  scopeTabInactive: {
    backgroundColor: "transparent",
    borderColor: "#ec4899",
  },
  scopeTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ec4899",
  },
  scopeTabTextActive: {
    color: "#fff",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  cardTitle: { color: "#111827", fontWeight: "700", fontSize: 16 },
  cardDescription: {
    color: "#6b7280",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  cardBody: { padding: 16 },
  inputGroup: { marginBottom: 16 },
  label: {
    fontSize: 12,
    color: "#4b5563",
    marginBottom: 6,
    fontWeight: "600",
  },
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
  imageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  imageButtonText: {
    color: "#ec4899",
    fontSize: 14,
    fontWeight: "600",
  },
  imagePreview: {
    marginTop: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: 200,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  helpText: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
  },
  previewContainer: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    height: 250,
    marginTop: 8,
  },
  previewHeroImage: {
    width: "100%",
    height: "100%",
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  previewContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  previewBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  previewBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  previewTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  previewSubtitle: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 14,
    marginBottom: 12,
  },
  previewButtons: {
    flexDirection: "row",
    gap: 8,
  },
  previewButtonPrimary: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  previewButtonSecondary: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  previewButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    borderRadius: 8,
    padding: 14,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
    backgroundColor: "#4B5563",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: "50%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
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
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
    gap: 12,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalOptionText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "500",
  },
});
