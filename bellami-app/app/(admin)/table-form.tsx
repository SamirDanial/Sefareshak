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
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { reservationService, type TableFormData, type Zone } from "@/src/services/reservationService";
import ApiService from "@/src/services/apiService";
import branchService from "@/src/services/branchService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";

interface Branch {
  id: string;
  name?: string | null;
}

export default function TableFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;
  const { getToken } = useAuthRole();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

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

  const [formState, setFormState] = useState<TableFormData>({
    tableNumber: "",
    capacity: 2,
    branchId: "",
    zoneId: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });
  
  // Branch and Zone state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [availableZones, setAvailableZones] = useState<Zone[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingZones, setLoadingZones] = useState(false);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showZonePicker, setShowZonePicker] = useState(false);

  // Load branches on mount
  useEffect(() => {
    loadBranches();
  }, []);

  // Load zones when branch changes
  useEffect(() => {
    if (formState.branchId) {
      loadZones(formState.branchId);
    } else {
      setAvailableZones([]);
      setFormState(prev => ({ ...prev, zoneId: "" }));
    }
  }, [formState.branchId]);

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = (await getToken()) || undefined;
      const fetchedBranches = await branchService.getBranches(token);
      setBranches(fetchedBranches as any);
    } catch (error) {
      console.error("Error loading branches:", error);
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadZones = async (branchId: string) => {
    if (!branchId) {
      setAvailableZones([]);
      return;
    }
    try {
      setLoadingZones(true);
      const token = (await getToken()) || undefined;
      const response = await reservationService.getZones(branchId, token);
      setAvailableZones(response.zones);
    } catch (error) {
      console.error("Error loading zones:", error);
      setAvailableZones([]);
    } finally {
      setLoadingZones(false);
    }
  };

  // Fetch table data if editing
  useEffect(() => {
    const loadTableData = async () => {
      if (!isEditing || !params.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const token = (await getToken()) || undefined;
        // Fetch table by getting all tables and finding the one with matching id
        const response = await reservationService.getTables(
          1,
          1000,
          "tableNumber",
          "asc",
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          token
        );
        const table = response.data.find((t) => t.id === params.id);
        if (!table) {
          throw new Error("Table not found");
        }
        setFormState({
          tableNumber: table.tableNumber,
          capacity: table.capacity,
          branchId: table.branchId || "",
          zoneId: table.zoneId || "",
          notes: table.notes || "",
        });
        // Load zones for the table's branch
        if (table.branchId) {
          await loadZones(table.branchId);
        }
      } catch (error) {
        console.error("Error loading table:", error);
        setToast({
          visible: true,
          message: t("admin.tableManagement.messages.loadError"),
          type: "error",
        });
        router.back();
      } finally {
        setLoading(false);
      }
    };

    loadTableData();
  }, [isEditing, params.id, getToken, t, router]);

  const handleBranchSelect = async (branchId: string) => {
    setFormState(prev => ({ ...prev, branchId, zoneId: "" }));
    setShowBranchPicker(false);
    await loadZones(branchId);
  };

  const handleZoneSelect = (zoneId: string) => {
    setFormState(prev => ({ ...prev, zoneId: zoneId === "none" ? "" : zoneId }));
    setShowZonePicker(false);
  };

  const handleSave = async () => {
    try {
      if (!formState.tableNumber.trim()) {
        setToast({
          visible: true,
          message: t("admin.tableManagement.messages.saveError"),
          type: "error",
        });
        return;
      }
      if (!formState.branchId) {
        setToast({
          visible: true,
          message: t("admin.tableManagement.form.selectBranchFirst"),
          type: "error",
        });
        return;
      }
      setSaving(true);
      const token = (await getToken()) || undefined;

      if (isEditing && params.id) {
        await reservationService.updateTable(params.id, formState, token);
        setToast({
          visible: true,
          message: t("admin.tableManagement.messages.tableUpdated"),
          type: "success",
        });
      } else {
        await reservationService.createTable(formState, token);
        setToast({
          visible: true,
          message: t("admin.tableManagement.messages.tableCreated"),
          type: "success",
        });
      }

      // Navigate back after a short delay to show success message
      setTimeout(() => {
        router.back();
      }, 500);
    } catch (error: any) {
      console.error("Error saving table:", error);
      setToast({
        visible: true,
        message: error.response?.data?.error || t("admin.tableManagement.messages.saveError"),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={
            isEditing
              ? t("admin.tableManagement.dialog.editTable")
              : t("admin.tableManagement.dialog.createTable")
          }
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.tableManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <AnimatedHeader
        title={
          isEditing
            ? t("admin.tableManagement.dialog.editTable")
            : t("admin.tableManagement.dialog.createTable")
        }
        onBackPress={() => router.back()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + 24 },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formContainer}>
          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>
              {t("admin.tableManagement.form.tableNumber")}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t(
                "admin.tableManagement.form.tableNumberPlaceholder"
              )}
              placeholderTextColor="#6B7280"
              value={formState.tableNumber}
              onChangeText={(text) =>
                setFormState((prev) => ({ ...prev, tableNumber: text }))
              }
            />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>
              {t("admin.tableManagement.form.capacity")}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t("admin.tableManagement.form.capacityPlaceholder")}
              placeholderTextColor="#6B7280"
              keyboardType="numeric"
              value={
                formState.capacity > 0
                  ? String(formState.capacity)
                  : ""
              }
              onChangeText={(text) => {
                if (text === "") {
                  setFormState((prev) => ({ ...prev, capacity: 0 }));
                  return;
                }
                if (/^\d+$/.test(text)) {
                  const numeric = Number(text);
                  if (numeric >= 1 && numeric <= 50) {
                    setFormState((prev) => ({ ...prev, capacity: numeric }));
                  }
                }
              }}
            />
            <Text style={styles.inputHint}>
              {t("admin.tableManagement.form.capacityHint")}
            </Text>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>
              {t("admin.tableManagement.form.branch")} <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TouchableOpacity
              style={[styles.input, styles.pickerInput]}
              onPress={() => {
                loadBranches();
                setShowBranchPicker(true);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.pickerInputText,
                  !formState.branchId && styles.pickerInputTextPlaceholder,
                ]}
              >
                {formState.branchId
                  ? branches.find(b => b.id === formState.branchId)?.name || t("admin.tableManagement.form.selectBranch")
                  : t("admin.tableManagement.form.selectBranch")}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>
              {t("admin.tableManagement.form.zone")}
            </Text>
            <TouchableOpacity
              style={[
                styles.input,
                styles.pickerInput,
                !formState.branchId && styles.pickerInputDisabled,
              ]}
              onPress={() => {
                if (formState.branchId) {
                  setShowZonePicker(true);
                }
              }}
              activeOpacity={0.7}
              disabled={!formState.branchId}
            >
              <Text
                style={[
                  styles.pickerInputText,
                  !formState.branchId && styles.pickerInputTextPlaceholder,
                  !formState.branchId && styles.pickerInputTextDisabled,
                ]}
              >
                {!formState.branchId
                  ? t("admin.tableManagement.form.selectBranchFirst")
                  : formState.zoneId
                  ? availableZones.find(z => z.id === formState.zoneId)?.name || t("admin.tableManagement.noZone")
                  : t("admin.tableManagement.noZone")}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color={!formState.branchId ? "#6B7280" : "#9CA3AF"} />
            </TouchableOpacity>
            {!formState.branchId && (
              <Text style={styles.inputHint}>
                {t("admin.tableManagement.form.selectBranchFirst")}
              </Text>
            )}
          </View>

          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>
              {t("admin.tableManagement.form.notes")}
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t("admin.tableManagement.form.notesPlaceholder")}
              placeholderTextColor="#6B7280"
              multiline
              value={formState.notes}
              onChangeText={(text) =>
                setFormState((prev) => ({ ...prev, notes: text }))
              }
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryButtonText}>
            {t("admin.tableManagement.actions.cancel")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!formState.tableNumber || !formState.branchId || saving) && styles.primaryButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!formState.tableNumber || !formState.branchId || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {t("admin.tableManagement.actions.save")}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Branch Picker Modal */}
      <Modal
        transparent
        animationType="slide"
        visible={showBranchPicker}
        onRequestClose={() => setShowBranchPicker(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBranchPicker(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.tableManagement.form.branch")}
              </Text>
              <TouchableOpacity onPress={() => setShowBranchPicker(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {loadingBranches ? (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#ec4899" />
                </View>
              ) : (
                branches.map((branch) => (
                  <TouchableOpacity
                    key={branch.id}
                    style={[
                      styles.bottomSheetOption,
                      formState.branchId === branch.id && styles.bottomSheetOptionActive,
                    ]}
                    onPress={async () => {
                      await handleBranchSelect(branch.id);
                    }}
                  >
                    <Text
                      style={[
                        styles.bottomSheetOptionText,
                        formState.branchId === branch.id &&
                          styles.bottomSheetOptionTextActive,
                      ]}
                    >
                      {branch.name || branch.id}
                    </Text>
                    {formState.branchId === branch.id && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color="#ec4899"
                      />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Zone Picker Modal */}
      <Modal
        transparent
        animationType="slide"
        visible={showZonePicker}
        onRequestClose={() => setShowZonePicker(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowZonePicker(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.tableManagement.form.zone")}
              </Text>
              <TouchableOpacity onPress={() => setShowZonePicker(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {loadingZones ? (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#ec4899" />
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={[
                      styles.bottomSheetOption,
                      !formState.zoneId && styles.bottomSheetOptionActive,
                    ]}
                    onPress={() => handleZoneSelect("none")}
                  >
                    <Text
                      style={[
                        styles.bottomSheetOptionText,
                        !formState.zoneId && styles.bottomSheetOptionTextActive,
                      ]}
                    >
                      {t("admin.tableManagement.noZone")}
                    </Text>
                    {!formState.zoneId && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color="#ec4899"
                      />
                    )}
                  </TouchableOpacity>
                  {availableZones.map((zone) => (
                    <TouchableOpacity
                      key={zone.id}
                      style={[
                        styles.bottomSheetOption,
                        formState.zoneId === zone.id && styles.bottomSheetOptionActive,
                      ]}
                      onPress={() => handleZoneSelect(zone.id)}
                    >
                      <Text
                        style={[
                          styles.bottomSheetOptionText,
                          formState.zoneId === zone.id &&
                            styles.bottomSheetOptionTextActive,
                        ]}
                      >
                        {zone.name}
                      </Text>
                      {formState.zoneId === zone.id && (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={18}
                          color="#ec4899"
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
        topOffset={headerHeight + 12}
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
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  formContainer: {
    paddingHorizontal: 16,
    gap: 20,
  },
  formSection: {
    gap: 8,
  },
  inputLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#fff",
    backgroundColor: "#0f0f0f",
    fontSize: 15,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  inputHint: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 4,
  },
  pickerInput: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerInputDisabled: {
    opacity: 0.5,
  },
  pickerInputText: {
    color: "#fff",
    flex: 1,
    fontSize: 15,
  },
  pickerInputTextPlaceholder: {
    color: "#6B7280",
  },
  pickerInputTextDisabled: {
    color: "#6B7280",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    backgroundColor: "#0a0a0a",
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    backgroundColor: "#0f0f0f",
  },
  secondaryButtonText: {
    color: "#D1D5DB",
    fontWeight: "600",
    fontSize: 15,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#ec4899",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
    zIndex: 1000,
    elevation: 1000,
  },
  bottomSheetContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
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
    padding: 20,
    maxHeight: 500,
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
});
