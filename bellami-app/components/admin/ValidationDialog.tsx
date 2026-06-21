import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import { useAuthRole } from "@/src/contexts/AuthContext";
import branchService from "@/src/services/branchService";
import { type Organization } from "@/src/services/branchService";

interface ValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: Organization | null;
  onSuccess?: () => void;
  mode?: "create" | "edit";
  existingValidation?: any; // Existing validation data for edit mode
}

const ValidationDialog: React.FC<ValidationDialogProps> = ({
  open,
  onOpenChange,
  organization,
  onSuccess,
  mode = "create",
  existingValidation,
}) => {
  const { t } = useTranslation();
  const { getToken } = useAuthRole();

  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | "failed">("pending");
  const [notes, setNotes] = useState("");

  // Dialog states
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  const [paymentStatusDialogOpen, setPaymentStatusDialogOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // Populate form with existing validation data when in edit mode
  useEffect(() => {
    if (mode === "edit" && existingValidation && open) {
      setExpiresAt(existingValidation.expiresAt ? new Date(existingValidation.expiresAt).toISOString().split('T')[0] : "");
      setAmount(existingValidation.amount?.toString() || "");
      setCurrency(existingValidation.currency || "USD");
      // Convert uppercase enum values to lowercase for form state
      setPaymentMethod((existingValidation.paymentMethod || "CASH").toLowerCase() as "cash" | "online");
      setPaymentStatus((existingValidation.paymentStatus || "PENDING").toLowerCase() as "pending" | "paid" | "failed");
      setNotes(existingValidation.notes || "");
    } else if (mode === "create" && open) {
      resetForm();
    }
  }, [mode, existingValidation, open]);

  const resetForm = () => {
    setExpiresAt("");
    // For free organizations, reset payment fields to undefined
    // For paid organizations, set default values
    if (organization?.freeVersion) {
      setAmount("");
      setCurrency("USD");
      setPaymentMethod("cash");
      setPaymentStatus("pending");
    } else {
      setAmount("");
      setCurrency("USD");
      setPaymentMethod("cash");
      setPaymentStatus("pending");
    }
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!organization || !expiresAt) {
      showToast(t("admin.organizations.validation.validationDialog.validationRequired"), "error");
      return;
    }

    const token = await getToken();
    if (!token) return;

    setLoading(true);
    try {
      const data: any = {
        expiresAt,
        notes: notes.trim() || undefined,
      };

      // Add payment info only if amount is provided
      if (amount && parseFloat(amount) > 0) {
        data.amount = parseFloat(amount);
        data.currency = currency;
        data.paymentMethod = paymentMethod.toUpperCase() as "CASH" | "ONLINE";
        data.paymentStatus = paymentStatus.toUpperCase() as "PENDING" | "PAID" | "FAILED";
      }

      if (mode === "edit") {
        if (!existingValidation?.id) {
          throw new Error("Validation ID not found for edit mode");
        }
        const result = await branchService.updateValidation(organization.id, existingValidation.id, data, token);
        showToast(t("admin.organizations.validation.validationDialog.validationUpdated"), "success");
      } else {
        const result = await branchService.createValidation(organization.id, data, token);
        showToast(t("admin.organizations.validation.validationDialog.validationCreated"), "success");
      }
      
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Validation submission error:", error);
      showToast(
        error?.message ||
          t("admin.organizations.validation.validationDialog.validationFailed"),
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  // Simple toast implementation (you might want to use a proper toast library)
  const showToast = (message: string, type: "success" | "error") => {
    // For now, just log - you can implement a proper toast later
    // Note: Toast notifications are handled by the parent component
  };

  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];

  // Helper function to format date for display
  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Helper function to convert date to calendar format
  const toCalendarDateString = (date: Date | string | null) => {
    if (!date) return "";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().split('T')[0];
  };

  // Handle date selection from calendar
  const handleDateSelect = (day: any) => {
    const selectedDate = day.dateString;
    setExpiresAt(selectedDate);
    setShowCalendar(false);
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <Pressable
        style={styles.sheetOverlay}
        onPress={handleCancel}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.sheetKeyboardAvoid}
        >
          <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {mode === "edit" 
                  ? t("admin.organizations.validation.validationDialog.editTitle")
                  : t("admin.organizations.validation.validationDialog.createTitle")
                }
              </Text>
              <TouchableOpacity
                style={styles.sheetClose}
                onPress={handleCancel}
              >
                <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              nestedScrollEnabled={true}
              scrollEnabled={true}
              removeClippedSubviews={false}
              automaticallyAdjustContentInsets={false}
            >
              <View style={styles.sheetForm}>
                <View style={styles.field}>
                  <Text style={styles.label}>
                    {t("admin.organizations.validation.validationDialog.expiresAt")} {"*"}
                  </Text>
                  <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => setShowCalendar(!showCalendar)}
                  >
                    <Text style={styles.selectText}>
                      {expiresAt ? formatDisplayDate(expiresAt) : t("admin.organizations.validation.validationDialog.selectDate")}
                    </Text>
                    <MaterialCommunityIcons 
                      name={showCalendar ? "chevron-up" : "calendar"} 
                      size={16} 
                      color="#9CA3AF" 
                    />
                  </TouchableOpacity>
                </View>

                {/* Inline Calendar */}
                {showCalendar && (
                  <View style={styles.calendarWrapper}>
                    <View style={styles.calendarHeader}>
                      <Text style={styles.calendarTitle}>
                        {t("admin.organizations.validation.validationDialog.selectDate")}
                      </Text>
                      <TouchableOpacity
                        style={styles.calendarClose}
                        onPress={() => setShowCalendar(false)}
                      >
                        <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.calendarScrollWrapper}>
                      <Calendar
                        current={toCalendarDateString(expiresAt || new Date())}
                        minDate={toCalendarDateString(new Date())}
                        onDayPress={handleDateSelect}
                        theme={{
                          backgroundColor: '#0f0f0f',
                          calendarBackground: '#0f0f0f',
                          textSectionTitleColor: '#fff',
                          selectedDayBackgroundColor: '#ec4899',
                          selectedDayTextColor: '#fff',
                          todayTextColor: '#ec4899',
                          dayTextColor: '#D1D5DB',
                          textDisabledColor: '#4B5563',
                          arrowColor: '#ec4899',
                          monthTextColor: '#fff',
                          indicatorColor: '#ec4899',
                          textDayFontFamily: 'System',
                          textMonthFontFamily: 'System',
                          textDayHeaderFontFamily: 'System',
                        }}
                      />
                    </View>
                  </View>
                )}

                {/* Payment fields - only show for paid organizations */}
                {!organization?.freeVersion && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.label}>
                        {t("admin.organizations.validation.validationDialog.paymentAmount")}
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={amount}
                        onChangeText={setAmount}
                        placeholder={t("admin.organizations.validation.validationDialog.paymentAmountPlaceholder")}
                        placeholderTextColor="#6B7280"
                        keyboardType="numeric"
                      />
                    </View>

                    {amount && parseFloat(amount) > 0 && (
                      <View style={styles.field}>
                        <Text style={styles.label}>
                          {t("admin.organizations.validation.currency")}
                        </Text>
                        <TouchableOpacity
                          style={styles.selectButton}
                          onPress={() => {
                            // You can implement a picker here
                            // For now, cycle through currencies
                            const currencies = ["USD", "EUR", "GBP"];
                            const currentIndex = currencies.indexOf(currency);
                            const nextIndex = (currentIndex + 1) % currencies.length;
                            setCurrency(currencies[nextIndex]);
                          }}
                        >
                          <Text style={styles.selectText}>{currency}</Text>
                          <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
                        </TouchableOpacity>
                      </View>
                    )}

                    <View style={styles.field}>
                      <Text style={styles.label}>
                        {t("admin.organizations.validation.validationDialog.paymentMethod")}
                      </Text>
                      <TouchableOpacity
                        style={styles.selectButton}
                        onPress={() => setPaymentMethodDialogOpen(true)}
                      >
                        <Text style={styles.selectText}>
                          {paymentMethod === "cash" 
                            ? t("admin.organizations.validation.validationDialog.cash")
                            : t("admin.organizations.validation.validationDialog.online")
                          }
                        </Text>
                        <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>
                        {t("admin.organizations.validation.validationDialog.paymentStatus")}
                      </Text>
                      <TouchableOpacity
                        style={styles.selectButton}
                        onPress={() => setPaymentStatusDialogOpen(true)}
                      >
                        <Text style={styles.selectText}>
                          {paymentStatus === "pending" 
                            ? t("admin.organizations.validation.validationDialog.pending")
                            : paymentStatus === "paid"
                            ? t("admin.organizations.validation.validationDialog.paid")
                            : t("admin.organizations.validation.validationDialog.failed")
                          }
                        </Text>
                        <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <View style={styles.field}>
                  <Text style={styles.label}>
                    {t("admin.organizations.validation.validationDialog.notes")}
                  </Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder={t("admin.organizations.validation.validationDialog.notesPlaceholder")}
                    placeholderTextColor="#6B7280"
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.buttonCancel}
                onPress={handleCancel}
                disabled={loading}
              >
                <Text style={styles.buttonCancelText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.buttonSave,
                  (!expiresAt || loading) && styles.buttonSaveDisabled
                ]}
                onPress={handleSubmit}
                disabled={!expiresAt || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonSaveText}>
                    {t("admin.organizations.validation.validationDialog.validate", { defaultValue: "Validate" })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>

      {/* Payment Method Selection Dialog */}
      <Modal
        visible={paymentMethodDialogOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPaymentMethodDialogOpen(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setPaymentMethodDialogOpen(false)}
        >
          <Pressable style={styles.selectionSheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.selectionSheetHandle} />
            <View style={styles.selectionSheetHeader}>
              <Text style={styles.selectionSheetTitle}>
                {t("admin.organizations.validation.validationDialog.paymentMethod")}
              </Text>
              <TouchableOpacity
                style={styles.selectionSheetClose}
                onPress={() => setPaymentMethodDialogOpen(false)}
              >
                <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.selectionSheetContent}>
              <TouchableOpacity
                style={[
                  styles.selectionSheetItem,
                  paymentMethod === "cash" && styles.selectionSheetItemSelected
                ]}
                onPress={() => {
                  setPaymentMethod("cash");
                  setPaymentMethodDialogOpen(false);
                }}
              >
                <Text style={[
                  styles.selectionSheetItemText,
                  paymentMethod === "cash" && styles.selectionSheetItemTextSelected
                ]}>
                  {t("admin.organizations.validation.validationDialog.cash")}
                </Text>
                {paymentMethod === "cash" && (
                  <MaterialCommunityIcons name="check" size={20} color="#ec4899" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.selectionSheetItem,
                  paymentMethod === "online" && styles.selectionSheetItemSelected
                ]}
                onPress={() => {
                  setPaymentMethod("online");
                  setPaymentMethodDialogOpen(false);
                }}
              >
                <Text style={[
                  styles.selectionSheetItemText,
                  paymentMethod === "online" && styles.selectionSheetItemTextSelected
                ]}>
                  {t("admin.organizations.validation.validationDialog.online")}
                </Text>
                {paymentMethod === "online" && (
                  <MaterialCommunityIcons name="check" size={20} color="#ec4899" />
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Payment Status Selection Dialog */}
      <Modal
        visible={paymentStatusDialogOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPaymentStatusDialogOpen(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setPaymentStatusDialogOpen(false)}
        >
          <Pressable style={styles.selectionSheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.selectionSheetHandle} />
            <View style={styles.selectionSheetHeader}>
              <Text style={styles.selectionSheetTitle}>
                {t("admin.organizations.validation.validationDialog.paymentStatus")}
              </Text>
              <TouchableOpacity
                style={styles.selectionSheetClose}
                onPress={() => setPaymentStatusDialogOpen(false)}
              >
                <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.selectionSheetContent}>
              <TouchableOpacity
                style={[
                  styles.selectionSheetItem,
                  paymentStatus === "pending" && styles.selectionSheetItemSelected
                ]}
                onPress={() => {
                  setPaymentStatus("pending");
                  setPaymentStatusDialogOpen(false);
                }}
              >
                <Text style={[
                  styles.selectionSheetItemText,
                  paymentStatus === "pending" && styles.selectionSheetItemTextSelected
                ]}>
                  {t("admin.organizations.validation.validationDialog.pending")}
                </Text>
                {paymentStatus === "pending" && (
                  <MaterialCommunityIcons name="check" size={20} color="#ec4899" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.selectionSheetItem,
                  paymentStatus === "paid" && styles.selectionSheetItemSelected
                ]}
                onPress={() => {
                  setPaymentStatus("paid");
                  setPaymentStatusDialogOpen(false);
                }}
              >
                <Text style={[
                  styles.selectionSheetItemText,
                  paymentStatus === "paid" && styles.selectionSheetItemTextSelected
                ]}>
                  {t("admin.organizations.validation.validationDialog.paid")}
                </Text>
                {paymentStatus === "paid" && (
                  <MaterialCommunityIcons name="check" size={20} color="#ec4899" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.selectionSheetItem,
                  paymentStatus === "failed" && styles.selectionSheetItemSelected
                ]}
                onPress={() => {
                  setPaymentStatus("failed");
                  setPaymentStatusDialogOpen(false);
                }}
              >
                <Text style={[
                  styles.selectionSheetItemText,
                  paymentStatus === "failed" && styles.selectionSheetItemTextSelected
                ]}>
                  {t("admin.organizations.validation.validationDialog.failed")}
                </Text>
                {paymentStatus === "failed" && (
                  <MaterialCommunityIcons name="check" size={20} color="#ec4899" />
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end" as const,
  },
  sheetKeyboardAvoid: {
    justifyContent: "flex-end" as const,
  },
  sheetContainer: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "#262626",
    paddingBottom: 10,
    maxHeight: "90%" as const,
  },
  sheetHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#404040",
    alignSelf: "center" as const,
    marginTop: 10,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  sheetTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "#262626",
  },
  sheetScroll: {
    maxHeight: 560,
  },
  sheetScrollContent: {
    flexGrow: 1,
  },
  sheetForm: {
    padding: 16,
    gap: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600" as const,
  },
  input: {
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top" as const,
  },
  selectButton: {
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  selectText: {
    color: "#fff",
    fontSize: 14,
  },
  sheetActions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  buttonCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#262626",
  },
  buttonCancelText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "600" as const,
  },
  buttonSave: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  buttonSaveDisabled: {
    opacity: 0.5,
  },
  buttonSaveText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600" as const,
  },
  // Selection dialog styles
  selectionSheetContainer: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "#262626",
    paddingBottom: 10,
  },
  selectionSheetHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#404040",
    alignSelf: "center" as const,
    marginTop: 10,
    marginBottom: 8,
  },
  selectionSheetHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  selectionSheetTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  selectionSheetClose: {
    padding: 4,
  },
  selectionSheetContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectionSheetItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  selectionSheetItemSelected: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  selectionSheetItemText: {
    color: "#D1D5DB",
    fontSize: 16,
    fontWeight: "500" as const,
  },
  selectionSheetItemTextSelected: {
    color: "#ec4899",
    fontWeight: "600" as const,
  },
  // Date picker styles
  datePickerContainer: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "#262626",
    paddingBottom: 20,
    maxHeight: "80%" as const,
  },
  datePickerHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#404040",
    alignSelf: "center" as const,
    marginTop: 10,
    marginBottom: 8,
  },
  datePickerHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  datePickerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  datePickerClose: {
    padding: 4,
  },
  calendarContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  // Inline calendar styles
  calendarWrapper: {
    backgroundColor: '#0f0f0f',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 16,
    overflow: 'hidden' as const,
  },
  calendarHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    backgroundColor: '#0f0f0f',
  },
  calendarTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600" as const,
  },
  calendarClose: {
    padding: 4,
  },
  calendarScrollWrapper: {
    maxHeight: 300,
  },
});

export default ValidationDialog;
