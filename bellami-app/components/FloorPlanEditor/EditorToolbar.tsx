import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { FloorElementType } from "@/src/services/reservationService";
import type { TableShape } from "./types";
import {
  FLOOR_ELEMENT_TYPES,
  TABLE_SHAPES,
  MIN_ZOOM,
  MAX_ZOOM,
  MIN_CANVAS_SIZE,
  MAX_CANVAS_SIZE,
} from "./types";

interface EditorToolbarProps {
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  showGrid: boolean;
  snapToGrid: boolean;
  saving: boolean;
  readOnly?: boolean;
  dockMode?: boolean;
  paintMode?: boolean;
  onTogglePaintMode?: () => void;
  onAddTable: (tableNumber: string, capacity: number, shape: TableShape) => void;
  onAddElement: (type: FloorElementType, label?: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onCanvasSizeChange: (width: number, height: number) => void;
  onSave: () => void;
  onCancel: () => void;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  canvasWidth,
  canvasHeight,
  zoom,
  showGrid,
  snapToGrid,
  saving,
  readOnly = false,
  dockMode = false,
  paintMode = false,
  onTogglePaintMode,
  onAddTable,
  onAddElement,
  onZoomIn,
  onZoomOut,
  onToggleGrid,
  onToggleSnap,
  onCanvasSizeChange,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();
  
  // Modal states
  const [isTableDialogOpen, setIsTableDialogOpen] = useState(false);
  const [isElementMenuOpen, setIsElementMenuOpen] = useState(false);
  const [isCanvasSizeDialogOpen, setIsCanvasSizeDialogOpen] = useState(false);
  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  
  // Form states
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("2");
  const [newTableShape, setNewTableShape] = useState<TableShape>("SQUARE");
  const [newCanvasWidth, setNewCanvasWidth] = useState(canvasWidth.toString());
  const [newCanvasHeight, setNewCanvasHeight] = useState(canvasHeight.toString());
  const [newLabelText, setNewLabelText] = useState("");
  const [showShapeSelector, setShowShapeSelector] = useState(false);

  const handleAddTable = () => {
    if (!newTableNumber.trim()) return;
    onAddTable(newTableNumber.trim(), parseInt(newTableCapacity) || 2, newTableShape);
    setNewTableNumber("");
    setNewTableCapacity("2");
    setNewTableShape("SQUARE");
    setIsTableDialogOpen(false);
  };

  const handleAddElement = (type: FloorElementType) => {
    setIsElementMenuOpen(false);
    if (type === "LABEL") {
      setIsLabelDialogOpen(true);
    } else {
      onAddElement(type);
    }
  };

  const handleAddLabel = () => {
    onAddElement("LABEL", newLabelText || "Label");
    setNewLabelText("");
    setIsLabelDialogOpen(false);
  };

  const handleCanvasSizeChange = () => {
    const width = Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, parseInt(newCanvasWidth) || MIN_CANVAS_SIZE));
    const height = Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, parseInt(newCanvasHeight) || MIN_CANVAS_SIZE));
    onCanvasSizeChange(width, height);
    setIsCanvasSizeDialogOpen(false);
  };

  const getElementIcon = (type: string): keyof typeof MaterialCommunityIcons.glyphMap => {
    const config = FLOOR_ELEMENT_TYPES.find((el) => el.type === type);
    return (config?.icon as keyof typeof MaterialCommunityIcons.glyphMap) || "shape";
  };

  return (
    <View style={dockMode ? styles.dockContainer : styles.container}>
      {dockMode ? (
        <View style={styles.dockRow}>
          {!readOnly && (
            <>
              <TouchableOpacity
                style={styles.dockBtn}
                onPress={() => setIsTableDialogOpen(true)}
              >
                <MaterialCommunityIcons name="table-furniture" size={22} color="#fff" />
                <Text style={styles.dockText}>{"Table"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dockBtn}
                onPress={() => setIsElementMenuOpen(true)}
              >
                <MaterialCommunityIcons name="shape" size={22} color="#fff" />
                <Text style={styles.dockText}>{"Element"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dockBtn, paintMode && styles.dockBtnActive]}
                onPress={() => onTogglePaintMode?.()}
              >
                <MaterialCommunityIcons name="brush" size={22} color="#fff" />
                <Text style={styles.dockText}>{"Paint"}</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={[styles.dockBtn, showGrid && styles.dockBtnActive]}
            onPress={onToggleGrid}
          >
            <MaterialCommunityIcons name="grid" size={22} color="#fff" />
            <Text style={styles.dockText}>{t("admin.tableManagement.floorPlan.grid", "Grid")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dockBtn, snapToGrid && styles.dockBtnActive]}
            onPress={onToggleSnap}
          >
            <MaterialCommunityIcons name="magnet" size={22} color="#fff" />
            <Text style={styles.dockText}>{t("admin.tableManagement.floorPlan.snap", "Snap")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dockBtn}
            onPress={onZoomOut}
            disabled={zoom <= MIN_ZOOM}
          >
            <MaterialCommunityIcons name="magnify-minus" size={22} color={zoom <= MIN_ZOOM ? "#666" : "#fff"} />
            <Text style={styles.dockText}>{"-"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dockBtn}
            onPress={onZoomIn}
            disabled={zoom >= MAX_ZOOM}
          >
            <MaterialCommunityIcons name="magnify-plus" size={22} color={zoom >= MAX_ZOOM ? "#666" : "#fff"} />
            <Text style={styles.dockText}>{Math.round(zoom * 100)}%</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Top Row - Add buttons and Actions */}
          <View style={styles.topRow}>
            {/* Left side controls */}
            <View style={styles.leftButtons}>
              {!readOnly && (
                <>
                  {/* Add Table Button */}
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => setIsTableDialogOpen(true)}
                  >
                    <MaterialCommunityIcons name="table-furniture" size={18} color="#fff" />
                    <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                  </TouchableOpacity>

                  {/* Add Element Button */}
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => setIsElementMenuOpen(true)}
                  >
                    <MaterialCommunityIcons name="shape" size={18} color="#fff" />
                    <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                    <MaterialCommunityIcons name="chevron-down" size={14} color="#fff" />
                  </TouchableOpacity>

                  <View style={styles.separator} />

                  {/* Canvas Size Button */}
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => {
                      setNewCanvasWidth(canvasWidth.toString());
                      setNewCanvasHeight(canvasHeight.toString());
                      setIsCanvasSizeDialogOpen(true);
                    }}
                  >
                    <MaterialCommunityIcons name="resize" size={20} color="#fff" />
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Save & Cancel */}
            <View style={styles.rightButtons}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={onCancel}
              >
                <MaterialCommunityIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
              {!readOnly && (
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={onSave}
                  disabled={saving}
                >
                  <MaterialCommunityIcons name="content-save" size={18} color="#fff" />
                  <Text style={styles.saveButtonText}>
                    {saving ? "..." : t("admin.tableManagement.floorPlan.save", "Save")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Bottom Row - View Controls */}
          <View style={styles.bottomRow}>
            <View style={styles.leftButtons}>
              {/* Grid Toggle */}
              <TouchableOpacity
                style={[styles.toggleButton, showGrid && styles.toggleButtonActive]}
                onPress={onToggleGrid}
              >
                <MaterialCommunityIcons name="grid" size={18} color="#fff" />
              </TouchableOpacity>

              {/* Snap Toggle */}
              <TouchableOpacity
                style={[styles.toggleButton, snapToGrid && styles.toggleButtonActive]}
                onPress={onToggleSnap}
              >
                <Text style={styles.toggleButtonText}>{t("admin.tableManagement.floorPlan.snap", "Snap")}</Text>
              </TouchableOpacity>
            </View>

            {/* Zoom Controls */}
            <View style={styles.zoomControls}>
              <TouchableOpacity
                style={styles.zoomButton}
                onPress={onZoomOut}
                disabled={zoom <= MIN_ZOOM}
              >
                <MaterialCommunityIcons
                  name="magnify-minus"
                  size={18}
                  color={zoom <= MIN_ZOOM ? "#666" : "#fff"}
                />
              </TouchableOpacity>
              <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
              <TouchableOpacity
                style={styles.zoomButton}
                onPress={onZoomIn}
                disabled={zoom >= MAX_ZOOM}
              >
                <MaterialCommunityIcons
                  name="magnify-plus"
                  size={18}
                  color={zoom >= MAX_ZOOM ? "#666" : "#fff"}
                />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* Add Table Dialog */}
      <Modal
        visible={isTableDialogOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsTableDialogOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setIsTableDialogOpen(false)}
          >
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>
                {t("admin.tableManagement.floorPlan.addTable", "Add Table")}
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t("admin.tableManagement.floorPlan.tableNumber", "Table Number")}
                </Text>
                <TextInput
                  style={styles.input}
                  value={newTableNumber}
                  onChangeText={setNewTableNumber}
                  placeholder="e.g., T1, A1, 101"
                  placeholderTextColor="#666"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t("admin.tableManagement.floorPlan.capacity", "Capacity")}
                </Text>
                <TextInput
                  style={styles.input}
                  value={newTableCapacity}
                  onChangeText={setNewTableCapacity}
                  keyboardType="number-pad"
                  placeholder="2"
                  placeholderTextColor="#666"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t("admin.tableManagement.floorPlan.shape", "Shape")}
                </Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowShapeSelector(!showShapeSelector)}
                >
                  <Text style={styles.selectButtonText}>
                    {t(`admin.tableManagement.floorPlan.${newTableShape.toLowerCase()}`, newTableShape)}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#fff" />
                </TouchableOpacity>
                {showShapeSelector && (
                  <View style={styles.shapeOptions}>
                    {TABLE_SHAPES.map((shape) => (
                      <TouchableOpacity
                        key={shape.value}
                        style={[
                          styles.shapeOption,
                          newTableShape === shape.value && styles.shapeOptionActive,
                        ]}
                        onPress={() => {
                          setNewTableShape(shape.value);
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
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setIsTableDialogOpen(false)}
                >
                  <Text style={styles.cancelButtonText}>
                    {t("admin.tableManagement.floorPlan.cancel", "Cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmButton, !newTableNumber.trim() && styles.confirmButtonDisabled]}
                  onPress={handleAddTable}
                  disabled={!newTableNumber.trim()}
                >
                  <Text style={styles.confirmButtonText}>
                    {t("admin.tableManagement.floorPlan.addTable", "Add Table")}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Element Menu */}
      <Modal
        visible={isElementMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsElementMenuOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsElementMenuOpen(false)}
        >
          <Pressable style={styles.elementMenuContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {t("admin.tableManagement.floorPlan.addElement", "Add Element")}
            </Text>
            <ScrollView style={styles.elementList}>
              {FLOOR_ELEMENT_TYPES.filter((el) => el.type !== "FLOOR_AREA").map((element) => (
                <TouchableOpacity
                  key={element.type}
                  style={styles.elementItem}
                  onPress={() => handleAddElement(element.type)}
                >
                  <MaterialCommunityIcons
                    name={getElementIcon(element.type)}
                    size={22}
                    color="#fff"
                  />
                  <Text style={styles.elementItemText}>
                    {t(`admin.tableManagement.floorPlan.elements.${element.type.toLowerCase()}`, element.label)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Canvas Size Dialog */}
      <Modal
        visible={isCanvasSizeDialogOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCanvasSizeDialogOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setIsCanvasSizeDialogOpen(false)}
          >
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>
                {t("admin.tableManagement.floorPlan.canvasSize", "Canvas Size")}
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t("admin.tableManagement.floorPlan.width", "Width")} (px)
                </Text>
                <TextInput
                  style={styles.input}
                  value={newCanvasWidth}
                  onChangeText={setNewCanvasWidth}
                  keyboardType="number-pad"
                  placeholder="800"
                  placeholderTextColor="#666"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t("admin.tableManagement.floorPlan.height", "Height")} (px)
                </Text>
                <TextInput
                  style={styles.input}
                  value={newCanvasHeight}
                  onChangeText={setNewCanvasHeight}
                  keyboardType="number-pad"
                  placeholder="600"
                  placeholderTextColor="#666"
                />
              </View>

              <Text style={styles.hintText}>
                Min: {MIN_CANVAS_SIZE}px, Max: {MAX_CANVAS_SIZE}px
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setIsCanvasSizeDialogOpen(false)}
                >
                  <Text style={styles.cancelButtonText}>
                    {t("admin.tableManagement.floorPlan.cancel", "Cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={handleCanvasSizeChange}
                >
                  <Text style={styles.confirmButtonText}>
                    {t("admin.tableManagement.floorPlan.apply", "Apply")}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Label Dialog */}
      <Modal
        visible={isLabelDialogOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsLabelDialogOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setIsLabelDialogOpen(false)}
          >
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>
                {t("admin.tableManagement.floorPlan.addLabel", "Add Label")}
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t("admin.tableManagement.floorPlan.labelText", "Label Text")}
                </Text>
                <TextInput
                  style={styles.input}
                  value={newLabelText}
                  onChangeText={setNewLabelText}
                  placeholder="e.g., Entrance, VIP Area"
                  placeholderTextColor="#666"
                />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setIsLabelDialogOpen(false)}
                >
                  <Text style={styles.cancelButtonText}>
                    {t("admin.tableManagement.floorPlan.cancel", "Cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={handleAddLabel}
                >
                  <Text style={styles.confirmButtonText}>
                    {t("admin.tableManagement.floorPlan.addLabel", "Add Label")}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1a1a1a",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#ec4899",
  },
  dockContainer: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
  },
  dockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  dockBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  dockBtnActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  dockText: {
    color: "#e5e7eb",
    fontSize: 11,
    fontWeight: "600",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  leftButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rightButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  separator: {
    width: 1,
    height: 24,
    backgroundColor: "#404040",
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ec4899",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toggleButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  toggleButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  zoomControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#262626",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  zoomButton: {
    padding: 4,
  },
  zoomText: {
    color: "#999",
    fontSize: 12,
    minWidth: 40,
    textAlign: "center",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#333",
  },
  elementMenuContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    width: "90%",
    maxWidth: 300,
    maxHeight: "70%",
    borderWidth: 1,
    borderColor: "#333",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    color: "#999",
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 15,
  },
  selectButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectButtonText: {
    color: "#fff",
    fontSize: 15,
  },
  shapeOptions: {
    marginTop: 8,
    backgroundColor: "#262626",
    borderRadius: 8,
    overflow: "hidden",
  },
  shapeOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  shapeOptionActive: {
    backgroundColor: "#ec4899",
  },
  shapeOptionText: {
    color: "#fff",
    fontSize: 14,
  },
  hintText: {
    color: "#666",
    fontSize: 12,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  confirmButton: {
    backgroundColor: "#ec4899",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  elementList: {
    maxHeight: 400,
  },
  elementItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    gap: 12,
  },
  elementItemText: {
    color: "#fff",
    fontSize: 15,
  },
});

export default EditorToolbar;

