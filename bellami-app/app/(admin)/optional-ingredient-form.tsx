import React, { useEffect, useState, useRef } from "react";
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
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import {
  optionalIngredientService,
  type OptionalIngredientFormData,
} from "@/src/services/optionalIngredientService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

export default function OptionalIngredientFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;
  const { getToken } = useAuthRole();
  const { canAny, isLoading: permissionsLoading } = usePermissions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const canViewOptionalIngredients =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.VIEW }]);

  const canCreateOptionalIngredient =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.CREATE }]);

  const canUpdateOptionalIngredient =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.UPDATE }]);

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

  const [formData, setFormData] = useState<OptionalIngredientFormData>({
    name: "",
    description: "",
  });
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  if (!permissionsLoading && !canViewOptionalIngredients) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={
            isEditing
              ? t("admin.optionalIngredientManagement.editOptionalIngredient")
              : t("admin.optionalIngredientManagement.createNewOptionalIngredient")
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

  useEffect(() => {
    if (permissionsLoading) return;
    if (isEditing && params.id) {
      loadOptionalIngredient(params.id);
    } else {
      setLoading(false);
    }
  }, [params.id, permissionsLoading]);

  const loadOptionalIngredient = async (id: string) => {
    try {
      setLoading(true);
      const token = await getToken();
      const ingredient =
        await optionalIngredientService.getOptionalIngredientById(
          id,
          token || undefined
        );
      setFormData({
        name: ingredient.name,
        description: ingredient.description || "",
      });
    } catch (e) {
      console.error("Load optional ingredient error:", e);
      setToast({
        visible: true,
        message: t("admin.optionalIngredientManagement.failedToFetch"),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (permissionsLoading) return;
    if (isEditing) {
      if (!canUpdateOptionalIngredient) return;
    } else {
      if (!canCreateOptionalIngredient) return;
    }

    if (!formData.name.trim()) {
      setToast({
        visible: true,
        message: t("admin.optionalIngredientManagement.nameRequired"),
        type: "error",
      });
      return;
    }
    try {
      setIsSubmitting(true);
      const token = await getToken();
      if (isEditing && params.id) {
        await optionalIngredientService.updateOptionalIngredient(
          params.id,
          {
            name: formData.name.trim(),
            description: formData.description || "",
          },
          token || undefined
        );
        setToast({
          visible: true,
          message: t("admin.optionalIngredientManagement.updatedSuccess"),
          type: "success",
        });
      } else {
        await optionalIngredientService.createOptionalIngredient(
          {
            name: formData.name.trim(),
            description: formData.description || "",
          },
          token || undefined
        );
        setToast({
          visible: true,
          message: t("admin.optionalIngredientManagement.createdSuccess"),
          type: "success",
        });
      }
      setTimeout(() => router.back(), 400);
    } catch (e) {
      console.error("Save optional ingredient error:", e);
      setToast({
        visible: true,
        message: t("admin.optionalIngredientManagement.failedToSave"),
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
              ? t("admin.optionalIngredientManagement.editOptionalIngredient")
              : t(
                  "admin.optionalIngredientManagement.createNewOptionalIngredient"
                )
          }
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.optionalIngredientManagement.loading")}
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
            ? t("admin.optionalIngredientManagement.editOptionalIngredient")
            : t(
                "admin.optionalIngredientManagement.createNewOptionalIngredient"
              )
        }
        onBackPress={() => router.back()}
      />

      <ScrollView
        style={styles.form}
        contentContainerStyle={[styles.formContent, { paddingTop: headerHeight + 24, paddingBottom: 100 }]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        {/* Name Field */}
        <View style={styles.field}>
          <Text style={styles.label}>
            {t("admin.optionalIngredientManagement.ingredientName")}{" "}
            <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t(
              "admin.optionalIngredientManagement.ingredientNamePlaceholder"
            )}
            placeholderTextColor="#6B7280"
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
            autoCapitalize="words"
          />
        </View>

        {/* Description Field */}
        <View style={styles.field}>
          <Text style={styles.label}>
            {t("admin.optionalIngredientManagement.descriptionLabel")}{" "}
            <Text style={styles.optional}>
              ({t("admin.optionalIngredientManagement.optional")})
            </Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t(
              "admin.optionalIngredientManagement.descriptionPlaceholder"
            )}
            placeholderTextColor="#6B7280"
            value={formData.description}
            onChangeText={(text) =>
              setFormData({ ...formData, description: text })
            }
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
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
            {t("admin.optionalIngredientManagement.cancel")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="check-circle" size={16} color="#fff" />
              <Text style={styles.submitButtonText}>
                {isEditing
                  ? t("admin.optionalIngredientManagement.update")
                  : t("admin.optionalIngredientManagement.create")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

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
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#ec4899",
    textAlign: "center",
    marginHorizontal: 16,
  },
  headerRight: {
    width: 32,
  },
  form: {
    flex: 1,
  },
  formContent: {
    padding: 16,
    gap: 24,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  required: {
    color: "#ef4444",
  },
  optional: {
    color: "#9CA3AF",
    fontWeight: "400",
  },
  input: {
    backgroundColor: "#171717",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#D1D5DB",
    borderWidth: 1,
    borderColor: "#262626",
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    backgroundColor: "#0a0a0a",
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#262626",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#D1D5DB",
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
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
