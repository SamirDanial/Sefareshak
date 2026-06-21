import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { PosCartItem } from "@/src/services/posOrderService";

type AdjustmentMode = "discount" | "surcharge";
type DiscountType = "FIXED" | "PERCENTAGE";
type Scope = "PER_LINE" | "PER_UNIT";

interface ItemAdjustmentSheetProps {
  visible: boolean;
  item: PosCartItem | null;
  currency: string;
  onClose: () => void;
  onApply: (
    itemId: string,
    discount: {
      type: DiscountType | null;
      value: number | null;
      scope: Scope;
    },
    surcharge: {
      amount: number | null;
      scope: Scope;
    }
  ) => void;
}

/**
 * Formats a raw integer (cents) into a currency display string.
 * E.g. 0 -> "0.00", 1 -> "0.01", 123 -> "1.23", 1000 -> "10.00"
 */
function formatCentsDisplay(cents: number): string {
  if (cents === 0) return "";
  return (cents / 100).toFixed(2);
}

/**
 * Handles European POS-style currency input.
 * Each digit press shifts existing digits left and appends the new digit to cents.
 * Backspace removes the last digit (shifts right).
 */
function handleCurrencyInput(currentCents: number, text: string, prevDisplay: string): { cents: number; display: string } {
  // Determine what changed - if text is shorter, it's a backspace
  if (text.length < prevDisplay.length || text === "") {
    const newCents = Math.floor(currentCents / 10);
    return { cents: newCents, display: formatCentsDisplay(newCents) };
  }
  // Find the new character(s) appended
  // We only care about digits
  const newChars = text.replace(/[^0-9]/g, "");
  const oldChars = prevDisplay.replace(/[^0-9]/g, "");
  if (newChars.length > oldChars.length) {
    const addedDigits = newChars.slice(oldChars.length);
    let cents = currentCents;
    for (const d of addedDigits) {
      cents = cents * 10 + parseInt(d, 10);
    }
    return { cents, display: formatCentsDisplay(cents) };
  }
  // No meaningful change
  return { cents: currentCents, display: prevDisplay };
}

export function ItemAdjustmentSheet({
  visible,
  item,
  currency,
  onClose,
  onApply,
}: ItemAdjustmentSheetProps) {
  const { t } = useTranslation();

  const [mode, setMode] = useState<AdjustmentMode>("discount");
  const [discountType, setDiscountType] = useState<DiscountType>("FIXED");
  const [discountValue, setDiscountValue] = useState("");
  const [discountCents, setDiscountCents] = useState(0);
  const [discountScope, setDiscountScope] = useState<Scope>("PER_LINE");
  const [surchargeValue, setSurchargeValue] = useState("");
  const [surchargeCents, setSurchargeCents] = useState(0);
  const [surchargeScope, setSurchargeScope] = useState<Scope>("PER_LINE");

  useEffect(() => {
    if (item && visible) {
      setMode("discount");
      setDiscountType(item.itemDiscountType ?? "FIXED");
      const discType = item.itemDiscountType ?? "FIXED";
      if (discType === "FIXED" && item.itemDiscountValue != null) {
        const cents = Math.round(item.itemDiscountValue * 100);
        setDiscountCents(cents);
        setDiscountValue(formatCentsDisplay(cents));
      } else {
        setDiscountCents(0);
        setDiscountValue(item.itemDiscountValue != null ? String(item.itemDiscountValue) : "");
      }
      setDiscountScope(item.itemDiscountScope ?? "PER_LINE");
      if (item.itemSurchargeAmount != null) {
        const cents = Math.round(item.itemSurchargeAmount * 100);
        setSurchargeCents(cents);
        setSurchargeValue(formatCentsDisplay(cents));
      } else {
        setSurchargeCents(0);
        setSurchargeValue("");
      }
      setSurchargeScope(item.itemSurchargeScope ?? "PER_LINE");
    }
  }, [item, visible]);

  if (!item) return null;

  const handleDiscountInput = (text: string) => {
    if (discountType === "FIXED") {
      const result = handleCurrencyInput(discountCents, text, discountValue);
      setDiscountCents(result.cents);
      setDiscountValue(result.display);
    } else {
      setDiscountValue(text);
    }
  };

  const handleSurchargeInput = (text: string) => {
    const result = handleCurrencyInput(surchargeCents, text, surchargeValue);
    setSurchargeCents(result.cents);
    setSurchargeValue(result.display);
  };

  const handleApply = () => {
    const discountVal = discountType === "FIXED" ? discountCents / 100 : parseFloat(discountValue);
    const surchargeVal = surchargeCents / 100;
    onApply(
      item.id,
      {
        type: !isNaN(discountVal) && discountVal > 0 ? discountType : null,
        value: !isNaN(discountVal) && discountVal > 0 ? discountVal : null,
        scope: discountScope,
      },
      {
        amount: !isNaN(surchargeVal) && surchargeVal > 0 ? surchargeVal : null,
        scope: surchargeScope,
      }
    );
    onClose();
  };

  const handleRemove = () => {
    onApply(item.id, { type: null, value: null, scope: "PER_LINE" }, { amount: null, scope: "PER_LINE" });
    onClose();
  };

  const hasExisting =
    (item.itemDiscountValue != null && item.itemDiscountValue > 0) ||
    (item.itemSurchargeAmount != null && item.itemSurchargeAmount > 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="tag-outline" size={20} color="#ec4899" />
              <Text style={styles.headerTitle}>{t("admin.pos.adjustItem", { defaultValue: "Adjust Item" })}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>

          {/* Mode selector */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeTab, mode === "discount" && styles.modeTabActive]}
              onPress={() => setMode("discount")}
            >
              <MaterialCommunityIcons
                name="tag-minus-outline"
                size={16}
                color={mode === "discount" ? "#22c55e" : "#6B7280"}
              />
              <Text style={[styles.modeTabText, mode === "discount" && styles.modeTabTextActive]}>
                {t("admin.pos.discount", { defaultValue: "Discount" })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, mode === "surcharge" && styles.modeTabActiveSurcharge]}
              onPress={() => setMode("surcharge")}
            >
              <MaterialCommunityIcons
                name="tag-plus-outline"
                size={16}
                color={mode === "surcharge" ? "#f59e0b" : "#6B7280"}
              />
              <Text style={[styles.modeTabText, mode === "surcharge" && styles.modeTabTextSurcharge]}>
                {t("admin.pos.surcharge", { defaultValue: "Surcharge" })}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Discount section */}
          {mode === "discount" && (
            <View style={styles.section}>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, discountType === "FIXED" && styles.typeBtnActive]}
                  onPress={() => { setDiscountType("FIXED"); setDiscountValue(""); setDiscountCents(0); }}
                >
                  <Text style={[styles.typeBtnText, discountType === "FIXED" && styles.typeBtnTextActive]}>
                    {currency} {t("admin.pos.fixedAmount", { defaultValue: "Fixed" })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, discountType === "PERCENTAGE" && styles.typeBtnActive]}
                  onPress={() => { setDiscountType("PERCENTAGE"); setDiscountValue(""); setDiscountCents(0); }}
                >
                  <Text style={[styles.typeBtnText, discountType === "PERCENTAGE" && styles.typeBtnTextActive]}>
                    % {t("admin.pos.percentage", { defaultValue: "Percent" })}
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                value={discountValue}
                onChangeText={handleDiscountInput}
                keyboardType="number-pad"
                placeholder={discountType === "FIXED" ? "0.00" : "0"}
                placeholderTextColor="#4B5563"
                selection={discountType === "FIXED" ? { start: discountValue.length, end: discountValue.length } : undefined}
              />

              <Text style={styles.scopeLabel}>{t("admin.pos.appliesTo", { defaultValue: "Applies to" })}</Text>
              <View style={styles.scopeRow}>
                <TouchableOpacity
                  style={[styles.scopeBtn, discountScope === "PER_LINE" && styles.scopeBtnActive]}
                  onPress={() => setDiscountScope("PER_LINE")}
                >
                  <Text style={[styles.scopeBtnText, discountScope === "PER_LINE" && styles.scopeBtnTextActive]}>
                    {t("admin.pos.perLine", { defaultValue: "Entire line" })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.scopeBtn, discountScope === "PER_UNIT" && styles.scopeBtnActive]}
                  onPress={() => setDiscountScope("PER_UNIT")}
                >
                  <Text style={[styles.scopeBtnText, discountScope === "PER_UNIT" && styles.scopeBtnTextActive]}>
                    {t("admin.pos.perUnit", { defaultValue: "Per unit" })}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Surcharge section */}
          {mode === "surcharge" && (
            <View style={styles.section}>
              <TextInput
                style={styles.input}
                value={surchargeValue}
                onChangeText={handleSurchargeInput}
                keyboardType="number-pad"
                placeholder="0.00"
                placeholderTextColor="#4B5563"
                selection={{ start: surchargeValue.length, end: surchargeValue.length }}
              />

              <Text style={styles.scopeLabel}>{t("admin.pos.appliesTo", { defaultValue: "Applies to" })}</Text>
              <View style={styles.scopeRow}>
                <TouchableOpacity
                  style={[styles.scopeBtn, surchargeScope === "PER_LINE" && styles.scopeBtnActive]}
                  onPress={() => setSurchargeScope("PER_LINE")}
                >
                  <Text style={[styles.scopeBtnText, surchargeScope === "PER_LINE" && styles.scopeBtnTextActive]}>
                    {t("admin.pos.perLine", { defaultValue: "Entire line" })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.scopeBtn, surchargeScope === "PER_UNIT" && styles.scopeBtnActive]}
                  onPress={() => setSurchargeScope("PER_UNIT")}
                >
                  <Text style={[styles.scopeBtnText, surchargeScope === "PER_UNIT" && styles.scopeBtnTextActive]}>
                    {t("admin.pos.perUnit", { defaultValue: "Per unit" })}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            {hasExisting && (
              <TouchableOpacity style={styles.removeBtn} onPress={handleRemove}>
                <Text style={styles.removeBtnText}>{t("admin.pos.removeAdjustment", { defaultValue: "Remove" })}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
              <Text style={styles.applyBtnText}>{t("admin.pos.applyAdjustment", { defaultValue: "Apply" })}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    width: 360,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  closeBtn: {
    padding: 4,
  },
  itemName: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: -6,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modeTabActive: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderColor: "rgba(34, 197, 94, 0.4)",
  },
  modeTabActiveSurcharge: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  modeTabText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "500",
  },
  modeTabTextActive: {
    color: "#22c55e",
  },
  modeTabTextSurcharge: {
    color: "#f59e0b",
  },
  section: {
    gap: 10,
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  typeBtnActive: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    borderColor: "rgba(99, 102, 241, 0.5)",
  },
  typeBtnText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "500",
  },
  typeBtnTextActive: {
    color: "#818cf8",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    color: "#111827",
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  scopeLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scopeRow: {
    flexDirection: "row",
    gap: 8,
  },
  scopeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  scopeBtnActive: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    borderColor: "rgba(99, 102, 241, 0.5)",
  },
  scopeBtnText: {
    color: "#6B7280",
    fontSize: 13,
  },
  scopeBtnTextActive: {
    color: "#818cf8",
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  removeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  removeBtnText: {
    color: "#F87171",
    fontSize: 14,
    fontWeight: "600",
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#ec4899",
    alignItems: "center",
  },
  applyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
