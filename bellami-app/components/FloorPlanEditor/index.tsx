import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  SafeAreaView,
  Alert,
  StatusBar,
  Dimensions,
  TouchableOpacity,
  Pressable,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import type { FloorElement, FloorElementType, FloorPlanTable } from "@/src/services/reservationService";
import EditorToolbar from "./EditorToolbar";
import EditorCanvas from "./EditorCanvas";
import EditorPropertiesPanel from "./EditorPropertiesPanel";
import type {
  DraggableTable,
  DraggableFloorElement,
  SelectedItem,
  FloorPlanEditorProps,
  TableShape,
} from "./types";
import {
  FLOOR_ELEMENT_TYPES,
  DEFAULT_TABLE_SIZE,
  MIN_ZOOM,
  MAX_ZOOM,
} from "./types";

const AREA_COLOR_PALETTE = [
  "#ec4899",
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#a855f7",
  "#14b8a6",
  "#ef4444",
  "#6b7280",
];

// Generate unique IDs for new items
const generateId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const FloorPlanEditor: React.FC<FloorPlanEditorProps> = ({
  zoneId,
  zoneName,
  canvasWidth: initialCanvasWidth = 800,
  canvasHeight: initialCanvasHeight = 600,
  tables: initialTables,
  floorElements: initialFloorElements,
  readOnly = false,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();
  const screenWidth = Dimensions.get("window").width;
  const DOCK_HEIGHT = 64;

  // Canvas state
  const [canvasWidth, setCanvasWidth] = useState(initialCanvasWidth);
  const [canvasHeight, setCanvasHeight] = useState(initialCanvasHeight);
  const [zoom, setZoom] = useState(() => {
    // Auto-fit zoom for mobile
    const padding = 32;
    const availableWidth = screenWidth - padding;
    const optimalZoom = Math.min(0.8, availableWidth / initialCanvasWidth);
    return Math.max(MIN_ZOOM, optimalZoom);
  });
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [saving, setSaving] = useState(false);

  // Items state
  const [tables, setTables] = useState<DraggableTable[]>(() =>
    initialTables.map((t) => ({
      id: t.id,
      type: "table" as const,
      tableNumber: t.tableNumber,
      capacity: t.capacity,
      shape: (t.shape as TableShape) || "SQUARE",
      status: t.status,
      positionX: t.positionX ?? 0,
      positionY: t.positionY ?? 0,
      width: t.width ?? DEFAULT_TABLE_SIZE,
      height: t.height ?? DEFAULT_TABLE_SIZE,
      rotation: t.rotation ?? 0,
    }))
  );

  const [elements, setElements] = useState<DraggableFloorElement[]>(() =>
    initialFloorElements.map((el) => ({
      id: el.id,
      type: "element" as const,
      elementType: el.type as FloorElementType,
      label: el.label,
      color: el.color,
      icon: el.icon,
      positionX: el.positionX,
      positionY: el.positionY,
      width: el.width,
      height: el.height,
      rotation: el.rotation,
    }))
  );

  // Track deleted tables for backend sync
  const [deletedTableIds, setDeletedTableIds] = useState<string[]>([]);

  // Track deleted elements for backend sync
  const [deletedElementIds, setDeletedElementIds] = useState<string[]>([]);

  // Selection state
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);

  // Paint mode state
  const [paintMode, setPaintMode] = useState(false);
  const [pendingPaintRect, setPendingPaintRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [isPaintPickerOpen, setIsPaintPickerOpen] = useState(false);

  // Handle item selection
  const handleSelectItem = useCallback(
    (id: string | null, type: "table" | "element" | null) => {
      if (id && type) {
        const item =
          type === "table"
            ? tables.find((t) => t.id === id) || null
            : elements.find((el) => el.id === id) || null;
        setSelectedItem(item);
        setIsPropertiesPanelOpen(!readOnly);
      } else {
        setSelectedItem(null);
        setIsPropertiesPanelOpen(false);
      }
    },
    [tables, elements, readOnly]
  );

  // Handle item movement
  const handleMoveItem = useCallback(
    (id: string, type: "table" | "element", positionX: number, positionY: number) => {
      if (readOnly) return;
      if (type === "table") {
        setTables((prev) =>
          prev.map((t) => (t.id === id ? { ...t, positionX, positionY } : t))
        );
        // Update selected item if it's the one being moved
        setSelectedItem((prev) =>
          prev && prev.type === "table" && prev.id === id
            ? { ...prev, positionX, positionY }
            : prev
        );
      } else {
        setElements((prev) =>
          prev.map((el) => (el.id === id ? { ...el, positionX, positionY } : el))
        );
        setSelectedItem((prev) =>
          prev && prev.type === "element" && prev.id === id
            ? { ...prev, positionX, positionY }
            : prev
        );
      }
    },
    [readOnly]
  );

  // Add new table
  const handleAddTable = useCallback(
    (tableNumber: string, capacity: number, shape: TableShape) => {
      if (readOnly) return;
      const newTable: DraggableTable = {
        id: generateId(),
        type: "table",
        tableNumber,
        capacity,
        shape,
        status: "AVAILABLE",
        positionX: 50,
        positionY: 50,
        width: DEFAULT_TABLE_SIZE,
        height: shape === "RECTANGLE" ? DEFAULT_TABLE_SIZE * 0.6 : DEFAULT_TABLE_SIZE,
        rotation: 0,
      };
      setTables((prev) => [...prev, newTable]);
      setSelectedItem(newTable);
      setIsPropertiesPanelOpen(!readOnly);
    },
    [readOnly]
  );

  // Add new floor element
  const handleAddElement = useCallback(
    (type: FloorElementType, label?: string) => {
      if (readOnly) return;
      const elementType = FLOOR_ELEMENT_TYPES.find((e) => e.type === type);
      const newElement: DraggableFloorElement = {
        id: generateId(),
        type: "element",
        elementType: type,
        label: label || undefined,
        positionX: 50,
        positionY: 50,
        width: elementType?.defaultWidth || 60,
        height: elementType?.defaultHeight || 60,
        rotation: 0,
      };
      setElements((prev) => [...prev, newElement]);
      setSelectedItem(newElement);
      setIsPropertiesPanelOpen(!readOnly);
    },
    [readOnly]
  );

  const handleTogglePaintMode = useCallback(() => {
    if (readOnly) return;
    setPaintMode((prev) => {
      const next = !prev;
      if (next) {
        setSelectedItem(null);
        setIsPropertiesPanelOpen(false);
      }
      return next;
    });
  }, [readOnly]);

  const handlePaintAreaComplete = useCallback((rect: { x: number; y: number; width: number; height: number }) => {
    setPendingPaintRect(rect);
    setIsPaintPickerOpen(true);
  }, []);

  const handlePickAreaImage = useCallback(async () => {
    if (readOnly) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        base64: true,
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.[0]?.base64) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType || "image/jpeg";
      const dataUrl = `data:${mimeType};base64,${asset.base64}`;

      if (!pendingPaintRect) return;

      const newArea: DraggableFloorElement = {
        id: generateId(),
        type: "element",
        elementType: "FLOOR_AREA" as FloorElementType,
        positionX: pendingPaintRect.x,
        positionY: pendingPaintRect.y,
        width: pendingPaintRect.width,
        height: pendingPaintRect.height,
        rotation: 0,
        icon: dataUrl,
      };
      setElements((prev) => [...prev, newArea]);
      setPaintMode(false);
      setPendingPaintRect(null);
      setIsPaintPickerOpen(false);
    } catch (e) {
      console.error("Failed to pick area image", e);
    }
  }, [pendingPaintRect, readOnly]);

  const handlePickAreaColor = useCallback(
    (color: string) => {
      if (readOnly) return;
      if (!pendingPaintRect) return;
      const newArea: DraggableFloorElement = {
        id: generateId(),
        type: "element",
        elementType: "FLOOR_AREA" as FloorElementType,
        positionX: pendingPaintRect.x,
        positionY: pendingPaintRect.y,
        width: pendingPaintRect.width,
        height: pendingPaintRect.height,
        rotation: 0,
        color,
      };
      setElements((prev) => [...prev, newArea]);
      setPaintMode(false);
      setPendingPaintRect(null);
      setIsPaintPickerOpen(false);
    },
    [pendingPaintRect, readOnly]
  );

  // Update table properties
  const handleUpdateTable = useCallback(
    (id: string, updates: Partial<DraggableTable>) => {
      if (readOnly) return;
      setTables((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
      );
      setSelectedItem((prev) =>
        prev && prev.type === "table" && prev.id === id
          ? { ...prev, ...updates }
          : prev
      );
    },
    []
  );

  // Update element properties
  const handleUpdateElement = useCallback(
    (id: string, updates: Partial<DraggableFloorElement>) => {
      if (readOnly) return;
      setElements((prev) =>
        prev.map((el) => (el.id === id ? { ...el, ...updates } : el))
      );
      setSelectedItem((prev) =>
        prev && prev.type === "element" && prev.id === id
          ? { ...prev, ...updates }
          : prev
      );
    },
    []
  );

  // Delete item
  const handleDelete = useCallback(
    (id: string, type: "table" | "element") => {
      if (readOnly) return;
      if (type === "table") {
        setTables((prev) => prev.filter((t) => t.id !== id));
        if (!id.startsWith("temp_")) {
          setDeletedTableIds((prev) => [...prev, id]);
        }
      } else {
        setElements((prev) => prev.filter((el) => el.id !== id));
        // Track deleted elements that exist in backend
        if (!id.startsWith("temp_")) {
          setDeletedElementIds((prev) => [...prev, id]);
        }
      }
      setSelectedItem(null);
      setIsPropertiesPanelOpen(false);
    },
    []
  );

  // Duplicate item
  const handleDuplicate = useCallback(
    (id: string, type: "table" | "element") => {
      if (readOnly) return;
      if (type === "table") {
        const original = tables.find((t) => t.id === id);
        if (original) {
          const newTable: DraggableTable = {
            ...original,
            id: generateId(),
            tableNumber: `${original.tableNumber}_copy`,
            positionX: original.positionX + 20,
            positionY: original.positionY + 20,
          };
          setTables((prev) => [...prev, newTable]);
          setSelectedItem(newTable);
        }
      } else {
        const original = elements.find((el) => el.id === id);
        if (original) {
          const newElement: DraggableFloorElement = {
            ...original,
            id: generateId(),
            positionX: original.positionX + 20,
            positionY: original.positionY + 20,
          };
          setElements((prev) => [...prev, newElement]);
          setSelectedItem(newElement);
        }
      }
    },
    [tables, elements]
  );

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev + 0.1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(MIN_ZOOM, prev - 0.1));
  }, []);

  // Canvas size change
  const handleCanvasSizeChange = useCallback((width: number, height: number) => {
    setCanvasWidth(width);
    setCanvasHeight(height);
  }, []);

  // Save floor plan
  const handleSave = useCallback(async () => {
    if (readOnly || !onSave) return;
    setSaving(true);
    try {
      // Separate new elements from existing ones
      const newElements = elements
        .filter((el) => el.id.startsWith("temp_"))
        .map((el) => ({
          type: el.elementType,
          label: el.label,
          color: el.color,
          icon: el.icon,
          positionX: el.positionX,
          positionY: el.positionY,
          width: el.width,
          height: el.height,
          rotation: el.rotation,
        }));

      const existingElements = elements
        .filter((el) => !el.id.startsWith("temp_"))
        .map((el) => ({
          id: el.id,
          zoneId,
          type: el.elementType,
          label: el.label,
          color: el.color,
          icon: el.icon,
          positionX: el.positionX,
          positionY: el.positionY,
          width: el.width,
          height: el.height,
          rotation: el.rotation,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

      await onSave({
        canvasSettings: { canvasWidth, canvasHeight },
        tables: tables.map((t) => ({
          id: t.id,
          tableNumber: t.tableNumber,
          capacity: t.capacity,
          positionX: t.positionX,
          positionY: t.positionY,
          width: t.width,
          height: t.height,
          rotation: t.rotation,
          shape: t.shape,
        })),
        floorElements: existingElements as FloorElement[],
        deletedTableIds,
        deletedElementIds,
        newElements,
      });
    } catch (error) {
      console.error("Error saving floor plan:", error);
      Alert.alert(
        t("admin.tableManagement.floorPlan.error", "Error"),
        t("admin.tableManagement.floorPlan.saveFailed", "Failed to save floor plan")
      );
    } finally {
      setSaving(false);
    }
  }, [
    canvasWidth,
    canvasHeight,
    readOnly,
    tables,
    elements,
    deletedElementIds,
    zoneId,
    onSave,
    t,
  ]);

  // Handle cancel with unsaved changes warning
  const handleCancel = useCallback(() => {
    // Check if there are unsaved changes
    const hasChanges =
      tables.length !== initialTables.length ||
      elements.length !== initialFloorElements.length ||
      deletedElementIds.length > 0;

    if (hasChanges) {
      Alert.alert(
        t("admin.tableManagement.floorPlan.unsavedChanges", "Unsaved Changes"),
        t(
          "admin.tableManagement.floorPlan.discardChangesMessage",
          "You have unsaved changes. Are you sure you want to discard them?"
        ),
        [
          {
            text: t("admin.tableManagement.floorPlan.cancel", "Cancel"),
            style: "cancel",
          },
          {
            text: t("admin.tableManagement.floorPlan.discard", "Discard"),
            style: "destructive",
            onPress: onCancel,
          },
        ]
      );
    } else {
      onCancel();
    }
  }, [tables, elements, deletedElementIds, initialTables, initialFloorElements, onCancel, t]);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />

        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topIconBtn} onPress={handleCancel}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.topTitleWrap}>
            <Text style={styles.topTitle} numberOfLines={1}>
              {zoneName}
            </Text>
            <Text style={styles.topSubtitle} numberOfLines={1}>
              {t("admin.tableManagement.floorPlan.title", "Floor Plan Editor")}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <MaterialCommunityIcons name="content-save" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{saving ? "..." : t("admin.tableManagement.floorPlan.save", "Save")}</Text>
          </TouchableOpacity>
        </View>

        {/* Canvas */}
        <View style={styles.canvasContainer}>
          <EditorCanvas
            width={canvasWidth}
            height={canvasHeight}
            zoom={zoom}
            showGrid={showGrid}
            snapToGrid={snapToGrid}
            tables={tables}
            floorElements={elements}
            selectedItem={selectedItem}
            paintMode={readOnly ? false : paintMode}
            onPaintAreaComplete={readOnly ? undefined : (rect) => {
              setPendingPaintRect(rect);
              setIsPaintPickerOpen(true);
            }}
            onSelectItem={handleSelectItem}
            onMoveItem={handleMoveItem}
            onZoomChange={setZoom}
          />
        </View>

        {/* Empty state hint */}
        {tables.length === 0 && elements.length === 0 && (
          <View style={styles.emptyHint} pointerEvents="none">
            <Text style={styles.emptyHintText}>
              {t(
                'admin.tableManagement.floorPlan.emptyHint',
                'Tap the table or element button to start designing your floor plan'
              )}
            </Text>
          </View>
        )}

        {/* Bottom Dock */}
        <View style={[styles.bottomDock, { height: DOCK_HEIGHT }]}>
          <EditorToolbar
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            zoom={zoom}
            showGrid={showGrid}
            snapToGrid={snapToGrid}
            saving={saving}
            readOnly={readOnly}
            dockMode={true}
            paintMode={readOnly ? false : paintMode}
            onTogglePaintMode={readOnly ? undefined : handleTogglePaintMode}
            onAddTable={handleAddTable}
            onAddElement={handleAddElement}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onToggleGrid={() => setShowGrid((prev) => !prev)}
            onToggleSnap={() => setSnapToGrid((prev) => !prev)}
            onCanvasSizeChange={handleCanvasSizeChange}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </View>

        {/* Paint Picker */}
        <Modal
          visible={isPaintPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setIsPaintPickerOpen(false);
            setPendingPaintRect(null);
          }}
        >
          <Pressable
            style={styles.paintOverlay}
            onPress={() => {
              setIsPaintPickerOpen(false);
              setPendingPaintRect(null);
            }}
          >
            <Pressable style={styles.paintCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.paintTitle}>{"Paint Area"}</Text>
              <Text style={styles.paintSubtitle}>{"Choose a color or an image"}</Text>

              <View style={styles.paintActionsRow}>
                <TouchableOpacity style={styles.paintImageBtn} onPress={handlePickAreaImage}>
                  <MaterialCommunityIcons name="image" size={18} color="#fff" />
                  <Text style={styles.paintImageBtnText}>{"Image"}</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.paletteGrid}>
                {AREA_COLOR_PALETTE.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.swatch, { backgroundColor: c }]}
                    onPress={() => handlePickAreaColor(c)}
                  />
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Properties Panel */}
        {!readOnly && (
          <EditorPropertiesPanel
            visible={isPropertiesPanelOpen}
            selectedItem={selectedItem}
            onClose={() => {
              setIsPropertiesPanelOpen(false);
              setSelectedItem(null);
            }}
            onUpdateTable={handleUpdateTable}
            onUpdateElement={handleUpdateElement}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            bottomInset={DOCK_HEIGHT}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#151515",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    gap: 10,
  },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  topTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  topTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  topSubtitle: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 1,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#ec4899",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  canvasContainer: {
    flex: 1,
  },
  emptyHint: {
    position: "absolute",
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 12,
    padding: 16,
  },
  emptyHintText: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
  },
  bottomDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#151515",
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  paintOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  paintCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 14,
    padding: 16,
  },
  paintTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  paintSubtitle: {
    marginTop: 4,
    color: "#9ca3af",
    fontSize: 12,
    marginBottom: 12,
  },
  paintActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 12,
  },
  paintImageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#333",
  },
  paintImageBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  paletteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
});

export default FloorPlanEditor;

