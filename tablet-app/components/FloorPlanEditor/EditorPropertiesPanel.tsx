import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Animated,
  Dimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { DraggableTable, DraggableFloorElement, SelectedItem, TableShape } from "./types";
import { TABLE_SHAPES, FLOOR_ELEMENT_TYPES } from "./types";

interface EditorPropertiesPanelProps {
  visible: boolean;
  selectedItem: SelectedItem;
  onClose: () => void;
  onUpdateTable: (id: string, updates: Partial<DraggableTable>) => void;
  onUpdateElement: (id: string, updates: Partial<DraggableFloorElement>) => void;
  onDelete: (id: string, type: "table" | "element") => void;
  onDuplicate: (id: string, type: "table" | "element") => void;
  bottomInset?: number;
}

const EditorPropertiesPanel: React.FC<EditorPropertiesPanelProps> = ({
  visible,
  selectedItem,
  onClose,
  onUpdateTable,
  onUpdateElement,
  onDelete,
  onDuplicate,
  bottomInset = 0,
}) => {
  const { t } = useTranslation();
  const [showShapeSelector, setShowShapeSelector] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!visible || !selectedItem) return null;

  const isTable = selectedItem.type === "table";
  const table = isTable ? (selectedItem as DraggableTable) : null;
  const element = !isTable ? (selectedItem as DraggableFloorElement) : null;

  const elementIcon = element
    ? FLOOR_ELEMENT_TYPES.find((t) => t.type === element.elementType)?.icon
    : undefined;

  const handleDuplicate = () => {
    if (selectedItem) {
      onDuplicate(selectedItem.id, selectedItem.type);
      onClose();
    }
  };

  const handleDelete = () => {
    if (selectedItem) {
      onDelete(selectedItem.id, selectedItem.type);
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  return (
    <>
      {/* Panel - positioned at bottom, doesn't block canvas touches */}
      <View style={[styles.panel, { bottom: bottomInset }]} pointerEvents="box-none">
        <View style={styles.panelContent}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons
                name={
                  isTable
                    ? "table-furniture"
                    : (elementIcon as keyof typeof MaterialCommunityIcons.glyphMap) || "shape"
                }
                size={18}
                color="#ec4899"
              />
              <Text style={styles.headerTitle} numberOfLines={1}>
                {isTable
                  ? `${t("admin.tableManagement.floorPlan.table", "Table")} ${table?.tableNumber}`
                  : t(`admin.tableManagement.floorPlan.elements.${element?.elementType?.toLowerCase() || "label"}`, element?.elementType || "Element")}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="close" size={20} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {/* Table Properties - 3 column grid */}
            {isTable && table && (
              <View style={styles.row3}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>#</Text>
                  <TextInput
                    style={styles.input}
                    value={table.tableNumber}
                    onChangeText={(value) => onUpdateTable(table.id, { tableNumber: value })}
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t("admin.tableManagement.floorPlan.cap", "Cap")}</Text>
                  <TextInput
                    style={styles.input}
                    value={table.capacity.toString()}
                    onChangeText={(value) =>
                      onUpdateTable(table.id, { capacity: parseInt(value) || 2 })
                    }
                    keyboardType="number-pad"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t("admin.tableManagement.floorPlan.shape", "Shape")}</Text>
                  <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => setShowShapeSelector(!showShapeSelector)}
                  >
                    <Text style={styles.selectButtonText} numberOfLines={1}>
                      {table.shape.charAt(0)}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={14} color="#999" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Shape Selector Dropdown */}
            {showShapeSelector && isTable && table && (
              <View style={styles.shapeDropdown}>
                {TABLE_SHAPES.map((shape) => (
                  <TouchableOpacity
                    key={shape.value}
                    style={[
                      styles.shapeOption,
                      table.shape === shape.value && styles.shapeOptionActive,
                    ]}
                    onPress={() => {
                      onUpdateTable(table.id, { shape: shape.value });
                      setShowShapeSelector(false);
                    }}
                  >
                    <Text style={styles.shapeOptionText}>
                      {t(`admin.tableManagement.floorPlan.${shape.value.toLowerCase()}`, shape.label)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Label text for LABEL elements */}
            {!isTable && element && element.elementType === "LABEL" && (
              <View style={styles.labelRow}>
                <Text style={styles.label}>{t("admin.tableManagement.floorPlan.elements.label", "Label")}</Text>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={element.label || ""}
                  onChangeText={(value) => onUpdateElement(element.id, { label: value })}
                  placeholder={t("admin.tableManagement.floorPlan.labelText", "Label text")}
                  placeholderTextColor="#666"
                />
              </View>
            )}

            {/* Position & Size - 4 column grid */}
            <View style={styles.row4}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>X</Text>
                <TextInput
                  style={styles.input}
                  value={Math.round(selectedItem.positionX).toString()}
                  onChangeText={(value) => {
                    const val = parseInt(value) || 0;
                    if (isTable) {
                      onUpdateTable(selectedItem.id, { positionX: val });
                    } else {
                      onUpdateElement(selectedItem.id, { positionX: val });
                    }
                  }}
                  keyboardType="number-pad"
                  placeholderTextColor="#666"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Y</Text>
                <TextInput
                  style={styles.input}
                  value={Math.round(selectedItem.positionY).toString()}
                  onChangeText={(value) => {
                    const val = parseInt(value) || 0;
                    if (isTable) {
                      onUpdateTable(selectedItem.id, { positionY: val });
                    } else {
                      onUpdateElement(selectedItem.id, { positionY: val });
                    }
                  }}
                  keyboardType="number-pad"
                  placeholderTextColor="#666"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>W</Text>
                <TextInput
                  style={styles.input}
                  value={Math.round(selectedItem.width).toString()}
                  onChangeText={(value) => {
                    const val = Math.max(1, parseInt(value) || 1);
                    if (isTable) {
                      onUpdateTable(selectedItem.id, { width: val });
                    } else {
                      onUpdateElement(selectedItem.id, { width: val });
                    }
                  }}
                  keyboardType="number-pad"
                  placeholderTextColor="#666"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>H</Text>
                <TextInput
                  style={styles.input}
                  value={Math.round(selectedItem.height).toString()}
                  onChangeText={(value) => {
                    const val = Math.max(1, parseInt(value) || 1);
                    if (isTable) {
                      onUpdateTable(selectedItem.id, { height: val });
                    } else {
                      onUpdateElement(selectedItem.id, { height: val });
                    }
                  }}
                  keyboardType="number-pad"
                  placeholderTextColor="#666"
                />
              </View>
            </View>

            {/* Rotation */}
            <View style={styles.rotationRow}>
              <View style={styles.rotationInputGroup}>
                <Text style={styles.label}>{t("admin.tableManagement.floorPlan.rot", "Rot")}°</Text>
                <TextInput
                  style={[styles.input, styles.rotationInput]}
                  value={selectedItem.rotation.toString()}
                  onChangeText={(value) => {
                    const val = (parseInt(value) || 0) % 360;
                    if (isTable) {
                      onUpdateTable(selectedItem.id, { rotation: val });
                    } else {
                      onUpdateElement(selectedItem.id, { rotation: val });
                    }
                  }}
                  keyboardType="number-pad"
                  placeholderTextColor="#666"
                />
              </View>
              <TouchableOpacity 
                style={styles.rotateBtn}
                onPress={() => {
                  const newRot = (selectedItem.rotation - 15 + 360) % 360;
                  if (isTable) {
                    onUpdateTable(selectedItem.id, { rotation: newRot });
                  } else {
                    onUpdateElement(selectedItem.id, { rotation: newRot });
                  }
                }}
              >
                <MaterialCommunityIcons name="rotate-left" size={18} color="#111827" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.rotateBtn}
                onPress={() => {
                  const newRot = (selectedItem.rotation + 15) % 360;
                  if (isTable) {
                    onUpdateTable(selectedItem.id, { rotation: newRot });
                  } else {
                    onUpdateElement(selectedItem.id, { rotation: newRot });
                  }
                }}
              >
                <MaterialCommunityIcons name="rotate-right" size={18} color="#111827" />
              </TouchableOpacity>
            </View>

            {/* Actions - Horizontal row */}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionButton} onPress={handleDuplicate}>
                <MaterialCommunityIcons name="content-copy" size={16} color="#111827" />
                <Text style={styles.actionText}>{t("admin.tableManagement.floorPlan.copy", "Copy")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => setShowDeleteConfirm(true)}
              >
                <MaterialCommunityIcons name="delete" size={16} color="#f87171" />
                <Text style={[styles.actionText, styles.deleteText]}>{t("admin.tableManagement.floorPlan.delete", "Delete")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <Pressable
          style={styles.confirmOverlay}
          onPress={() => setShowDeleteConfirm(false)}
        >
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>{t("admin.tableManagement.floorPlan.confirmDelete", "Delete?")}</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={styles.confirmCancelText}>{t("admin.tableManagement.floorPlan.cancel", "Cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteButton}
                onPress={handleDelete}
              >
                <Text style={styles.confirmDeleteText}>{t("admin.tableManagement.floorPlan.delete", "Delete")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  panelContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 16,
    // Add shadow for visual separation
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: 8,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#d1d5db",
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  headerTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  row3: {
    flexDirection: "row",
    gap: 8,
  },
  row4: {
    flexDirection: "row",
    gap: 8,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputGroup: {
    flex: 1,
  },
  label: {
    color: "#6B7280",
    fontSize: 10,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: "#111827",
    fontSize: 13,
    height: 34,
  },
  selectButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 34,
  },
  selectButtonText: {
    color: "#111827",
    fontSize: 13,
  },
  shapeDropdown: {
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    marginTop: -6,
    overflow: "hidden",
  },
  shapeOption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  shapeOptionActive: {
    backgroundColor: "#ec4899",
  },
  shapeOptionText: {
    color: "#111827",
    fontSize: 12,
  },
  rotationRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  rotationInputGroup: {
    flex: 1,
  },
  rotationInput: {
    width: 60,
  },
  rotateBtn: {
    backgroundColor: "#e5e7eb",
    borderRadius: 6,
    padding: 8,
    height: 34,
    width: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 4,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e5e7eb",
    borderRadius: 6,
    paddingVertical: 8,
    gap: 4,
  },
  deleteButton: {
    backgroundColor: "rgba(220, 38, 38, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.4)",
  },
  actionText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "500",
  },
  deleteText: {
    color: "#f87171",
  },
  // Confirm dialog
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  confirmDialog: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    width: 200,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  confirmTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  },
  confirmButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  confirmCancelButton: {
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  confirmCancelText: {
    color: "#111827",
    fontSize: 13,
  },
  confirmDeleteButton: {
    backgroundColor: "#dc2626",
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  confirmDeleteText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});

export default EditorPropertiesPanel;
