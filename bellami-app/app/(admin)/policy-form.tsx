import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Switch,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

type PolicyType =
  | "TERMS_OF_SERVICE"
  | "PRIVACY_POLICY"
  | "COOKIE_POLICY"
  | "REFUND_POLICY"
  | "DELIVERY_POLICY"
  | "DATA_PROTECTION_POLICY"
  | "USER_AGREEMENT"
  | "OTHER";

interface PolicyFormData {
  type: PolicyType;
  title: string;
  content: string;
  language: string;
  version: string;
  effectiveDate: string;
  isActive: boolean;
  isRequired: boolean;
}

const POLICY_TYPES: { value: PolicyType; label: string }[] = [
  { value: "TERMS_OF_SERVICE", label: "Terms of Service" },
  { value: "PRIVACY_POLICY", label: "Privacy Policy" },
  { value: "COOKIE_POLICY", label: "Cookie Policy" },
  { value: "REFUND_POLICY", label: "Refund Policy" },
  { value: "DELIVERY_POLICY", label: "Delivery Policy" },
  { value: "DATA_PROTECTION_POLICY", label: "Data Protection Policy" },
  { value: "USER_AGREEMENT", label: "User Agreement" },
  { value: "OTHER", label: "Other" },
];

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
];

export default function PolicyFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;
  const { getToken } = useAuthRole();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const [formData, setFormData] = useState<PolicyFormData>({
    type: "TERMS_OF_SERVICE",
    title: "",
    content: "",
    language: "en",
    version: "1.0",
    effectiveDate: new Date().toISOString().split("T")[0],
    isActive: false,
    isRequired: true,
  });

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const handleScroll = useCallback((event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);

    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection("down");
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection("up");
    }

    lastScrollY.current = currentScrollY;
  }, [setScrollPosition, setScrollDirection]);

  useEffect(() => {
    if (isEditing && params.id) {
      fetchPolicy();
    } else {
      setLoading(false);
    }
  }, [isEditing, params.id]);

  const fetchPolicy = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/api/terms-and-policies/${params.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        const policy = json.data;
        setFormData({
          type: policy.type,
          title: policy.title,
          content: policy.content,
          language: policy.language,
          version: policy.version,
          effectiveDate: policy.effectiveDate.split("T")[0],
          isActive: policy.isActive,
          isRequired: policy.isRequired,
        });
      }
    } catch (e) {
      console.error("Error fetching policy:", e);
      setToast({
        visible: true,
        message: "Failed to fetch policy",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      setToast({
        visible: true,
        message: "Title is required",
        type: "error",
      });
      return;
    }
    if (!formData.content.trim()) {
      setToast({
        visible: true,
        message: "Content is required",
        type: "error",
      });
      return;
    }
    if (!formData.version.trim()) {
      setToast({
        visible: true,
        message: "Version is required",
        type: "error",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      if (isEditing) {
        // Update existing
        const res = await fetch(
          `${API_BASE_URL}/api/terms-and-policies/${params.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              title: formData.title,
              content: formData.content,
              effectiveDate: formData.effectiveDate,
              isActive: formData.isActive,
              isRequired: formData.isRequired,
            }),
          }
        );
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Failed to update");
        }
        setToast({
          visible: true,
          message: "Policy updated successfully",
          type: "success",
        });
      } else {
        // Create new
        const res = await fetch(`${API_BASE_URL}/api/terms-and-policies`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Failed to create");
        }
        setToast({
          visible: true,
          message: "Policy created successfully",
          type: "success",
        });
      }

      // Navigate back after a short delay to show success message
      setTimeout(() => {
        router.back();
      }, 1000);
    } catch (e: any) {
      console.error("Error saving policy:", e);
      setToast({
        visible: true,
        message: e.message || "Failed to save policy",
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
          title={isEditing ? "Edit Policy" : "Create New Policy"}
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>Loading policy...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <AnimatedHeader
        title={isEditing ? "Edit Policy" : "Create New Policy"}
        onBackPress={() => router.back()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + 10, paddingBottom: 100 },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {!isEditing && (
          <>
            <Text style={styles.label}>Policy Type *</Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowTypeModal(true)}
            >
              <Text style={styles.selectButtonText}>
                {POLICY_TYPES.find((t) => t.value === formData.type)?.label ||
                  "Select Policy Type"}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            <Text style={styles.label}>Language *</Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowLanguageModal(true)}
            >
              <Text style={styles.selectButtonText}>
                {LANGUAGES.find((l) => l.code === formData.language)?.name ||
                  "Select Language"}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            <Text style={styles.label}>Version *</Text>
            <TextInput
              style={styles.input}
              value={formData.version}
              onChangeText={(text) =>
                setFormData({ ...formData, version: text })
              }
              placeholder="e.g., 1.0, 2.1"
              placeholderTextColor="#6B7280"
            />
          </>
        )}

        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          value={formData.title}
          onChangeText={(text) => setFormData({ ...formData, title: text })}
          placeholder="Policy title"
          placeholderTextColor="#6B7280"
        />

        <Text style={styles.label}>Content *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.content}
          onChangeText={(text) => setFormData({ ...formData, content: text })}
          placeholder="Policy content (supports HTML/markdown)"
          placeholderTextColor="#6B7280"
          multiline
          numberOfLines={10}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Effective Date *</Text>
        <TextInput
          style={styles.input}
          value={formData.effectiveDate}
          onChangeText={(text) =>
            setFormData({ ...formData, effectiveDate: text })
          }
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#6B7280"
        />

        <View style={styles.switchRow}>
          <View style={styles.switchLabelContainer}>
            <Text style={styles.switchLabel}>Active</Text>
            <Text style={styles.switchDescription}>
              Only one active version per type+language
            </Text>
          </View>
          <Switch
            value={formData.isActive}
            onValueChange={(value) =>
              setFormData({ ...formData, isActive: value })
            }
          />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchLabelContainer}>
            <Text style={styles.switchLabel}>Required</Text>
            <Text style={styles.switchDescription}>
              Users must accept this policy
            </Text>
          </View>
          <Switch
            value={formData.isRequired}
            onValueChange={(value) =>
              setFormData({ ...formData, isRequired: value })
            }
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>
              {isEditing ? "Update Policy" : "Create Policy"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Policy Type Selection Modal */}
      <Modal
        visible={showTypeModal}
        animationType="slide"
        transparent={true}
      >
        <Pressable
          style={styles.bottomModalOverlay}
          onPress={() => setShowTypeModal(false)}
        >
          <Pressable
            style={styles.bottomModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomModalHeader}>
              <Text style={styles.bottomModalTitle}>Select Policy Type</Text>
              <TouchableOpacity
                onPress={() => setShowTypeModal(false)}
                style={styles.bottomModalClose}
              >
                <MaterialCommunityIcons name="close" size={24} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomModalBody}>
              {POLICY_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.bottomModalOption,
                    formData.type === type.value && styles.bottomModalOptionActive,
                  ]}
                  onPress={() => {
                    setFormData({ ...formData, type: type.value });
                    setShowTypeModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomModalOptionText,
                      formData.type === type.value &&
                        styles.bottomModalOptionTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                  {formData.type === type.value && (
                    <MaterialCommunityIcons name="check" size={20} color="#ec4899" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguageModal}
        animationType="slide"
        transparent={true}
      >
        <Pressable
          style={styles.bottomModalOverlay}
          onPress={() => setShowLanguageModal(false)}
        >
          <Pressable
            style={styles.bottomModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomModalHeader}>
              <Text style={styles.bottomModalTitle}>Select Language</Text>
              <TouchableOpacity
                onPress={() => setShowLanguageModal(false)}
                style={styles.bottomModalClose}
              >
                <MaterialCommunityIcons name="close" size={24} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomModalBody}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.bottomModalOption,
                    formData.language === lang.code &&
                      styles.bottomModalOptionActive,
                  ]}
                  onPress={() => {
                    setFormData({ ...formData, language: lang.code });
                    setShowLanguageModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomModalOptionText,
                      formData.language === lang.code &&
                        styles.bottomModalOptionTextActive,
                    ]}
                  >
                    {lang.name}
                  </Text>
                  {formData.language === lang.code && (
                    <MaterialCommunityIcons name="check" size={20} color="#ec4899" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#9CA3AF",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#D1D5DB",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#262626",
    marginBottom: 16,
  },
  textArea: {
    minHeight: 200,
    textAlignVertical: "top",
  },
  selectButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#262626",
    marginBottom: 16,
  },
  selectButtonText: {
    fontSize: 16,
    color: "#fff",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    marginBottom: 8,
  },
  switchLabelContainer: {
    flex: 1,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  switchDescription: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  submitButton: {
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  bottomModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  bottomModalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },
  bottomModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  bottomModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  bottomModalClose: {
    padding: 4,
  },
  bottomModalBody: {
    maxHeight: 400,
  },
  bottomModalOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  bottomModalOptionActive: {
    backgroundColor: "#0f0f0f",
  },
  bottomModalOptionText: {
    fontSize: 16,
    color: "#D1D5DB",
  },
  bottomModalOptionTextActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
});

