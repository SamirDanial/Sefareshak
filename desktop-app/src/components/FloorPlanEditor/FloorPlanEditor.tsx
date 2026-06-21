import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { FloorElement, FloorElementType } from "@/services/reservationService";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Toolbar } from "./Toolbar";
import { Canvas } from "./Canvas";
import { PropertiesPanel } from "./PropertiesPanel";
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
  GRID_SIZE,
} from "./types";

const generateId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const FloorPlanEditor: React.FC<FloorPlanEditorProps> = ({
  zoneId,
  zoneName,
  readOnly = false,
  canvasWidth: initialCanvasWidth = 800,
  canvasHeight: initialCanvasHeight = 600,
  backgroundImage,
  tables: initialTables,
  floorElements: initialFloorElements,
  onRequestEditMode,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();

  const [isMobile, setIsMobile] = useState(false);
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [canvasWidth, setCanvasWidth] = useState(initialCanvasWidth);
  const [canvasHeight, setCanvasHeight] = useState(initialCanvasHeight);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paintMode, setPaintMode] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const backgroundSvg = useMemo(() => {
    if (!backgroundImage) return undefined;
    if (typeof backgroundImage !== "string") return undefined;
    if (backgroundImage.trim().startsWith("<svg")) return backgroundImage;
    if (backgroundImage.startsWith("data:image/svg+xml")) {
      try {
        const commaIndex = backgroundImage.indexOf(",");
        const raw = commaIndex >= 0 ? backgroundImage.slice(commaIndex + 1) : "";
        return decodeURIComponent(raw);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, [backgroundImage]);

  const FLOOR_COLOR_PALETTE = useMemo(
    () => [
      { name: "Gray", value: "#374151" },
      { name: "Slate", value: "#334155" },
      { name: "Stone", value: "#57534E" },
      { name: "Sand", value: "#A16207" },
      { name: "Green", value: "#16A34A" },
      { name: "Teal", value: "#0D9488" },
      { name: "Blue", value: "#2563EB" },
      { name: "Indigo", value: "#4F46E5" },
      { name: "Purple", value: "#7C3AED" },
      { name: "Pink", value: "#DB2777" },
    ],
    []
  );

  const [pendingPaintRect, setPendingPaintRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [paintPalettePos, setPaintPalettePos] = useState<{ x: number; y: number } | null>(null);
  const paintImageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isMobile && canvasWidth > 0) {
      const screenWidth = window.innerWidth - 32;
      const optimalZoom = Math.min(0.8, screenWidth / canvasWidth);
      setZoom(Math.max(0.3, optimalZoom));
    }
  }, [isMobile, canvasWidth]);

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

  const tablesRef = useRef(tables);
  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  const [elements, setElements] = useState<DraggableFloorElement[]>(() =>
    initialFloorElements.map((el) => ({
      id: el.id,
      type: "element" as const,
      elementType: el.type as FloorElementType,
      label: el.label ?? undefined,
      color: el.color ?? undefined,
      icon: el.icon ?? undefined,
      positionX: el.positionX,
      positionY: el.positionY,
      width: el.width,
      height: el.height,
      rotation: el.rotation,
    }))
  );

  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const [deletedElementIds, setDeletedElementIds] = useState<string[]>([]);
  const [deletedTableIds, setDeletedTableIds] = useState<string[]>([]);
  const [newTableIds, setNewTableIds] = useState<string[]>([]);
  const [newElementIds, setNewElementIds] = useState<string[]>([]);

  const deletedElementIdsRef = useRef(deletedElementIds);
  const deletedTableIdsRef = useRef(deletedTableIds);
  const newTableIdsRef = useRef(newTableIds);
  const newElementIdsRef = useRef(newElementIds);

  useEffect(() => {
    deletedElementIdsRef.current = deletedElementIds;
  }, [deletedElementIds]);

  useEffect(() => {
    deletedTableIdsRef.current = deletedTableIds;
  }, [deletedTableIds]);

  useEffect(() => {
    newTableIdsRef.current = newTableIds;
  }, [newTableIds]);

  useEffect(() => {
    newElementIdsRef.current = newElementIds;
  }, [newElementIds]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"table" | "element" | null>(null);

  const selectedItem = useMemo<SelectedItem>(() => {
    if (!selectedId || !selectedType) return null;
    if (selectedType === "table") {
      return tables.find((t) => t.id === selectedId) || null;
    }
    return elements.find((el) => el.id === selectedId) || null;
  }, [selectedId, selectedType, tables, elements]);

  const handleSelectItem = useCallback(
    (id: string | null, type: "table" | "element" | null) => {
      setSelectedId(id);
      setSelectedType(type);
      if (id && isMobile) {
        setIsPropertiesPanelOpen(true);
      }
    },
    [isMobile]
  );

  const handleMoveItem = useCallback(
    (id: string, type: "table" | "element", positionX: number, positionY: number) => {
      if (type === "table") {
        setTables((prev) => prev.map((t) => (t.id === id ? { ...t, positionX, positionY } : t)));
      } else {
        setElements((prev) => prev.map((el) => (el.id === id ? { ...el, positionX, positionY } : el)));
      }
      setIsDirty(true);
    },
    []
  );

  const handleAddTable = useCallback(
    (tableNumber: string, capacity: number, shape: TableShape) => {
      const id = generateId();
      const newTable: DraggableTable = {
        id,
        type: "table",
        tableNumber,
        capacity,
        shape,
        status: "AVAILABLE",
        positionX: snapToGrid ? GRID_SIZE * 2 : 50,
        positionY: snapToGrid ? GRID_SIZE * 2 : 50,
        width: shape === "RECTANGLE" ? 80 : DEFAULT_TABLE_SIZE,
        height: DEFAULT_TABLE_SIZE,
        rotation: 0,
      };
      setTables((prev) => {
        const next = [...prev, newTable];
        tablesRef.current = next;
        return next;
      });
      setNewTableIds((prev) => {
        const next = [...prev, id];
        newTableIdsRef.current = next;
        return next;
      });
      setSelectedId(id);
      setSelectedType("table");
      setIsDirty(true);
    },
    [snapToGrid]
  );

  const handleAddElement = useCallback(
    (type: FloorElementType, label?: string) => {
      const id = generateId();
      const elementDef = FLOOR_ELEMENT_TYPES.find((e) => e.type === type);
      const newElement: DraggableFloorElement = {
        id,
        type: "element",
        elementType: type,
        label: label || undefined,
        positionX: snapToGrid ? GRID_SIZE * 2 : 50,
        positionY: snapToGrid ? GRID_SIZE * 2 : 50,
        width: elementDef?.defaultWidth ?? 50,
        height: elementDef?.defaultHeight ?? 50,
        rotation: 0,
      };
      setElements((prev) => {
        const next = [...prev, newElement];
        elementsRef.current = next;
        return next;
      });
      setNewElementIds((prev) => {
        const next = [...prev, id];
        newElementIdsRef.current = next;
        return next;
      });
      setSelectedId(id);
      setSelectedType("element");
      setIsDirty(true);
    },
    [snapToGrid]
  );

  const handleUpdateTable = useCallback((id: string, updates: Partial<DraggableTable>) => {
    setTables((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...updates } : t));
      tablesRef.current = next;
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleUpdateElement = useCallback((id: string, updates: Partial<DraggableFloorElement>) => {
    setElements((prev) => {
      const next = prev.map((el) => (el.id === id ? { ...el, ...updates } : el));
      elementsRef.current = next;
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleDelete = useCallback(
    (id: string, type: "table" | "element") => {
      if (type === "table") {
        setTables((prev) => {
          const next = prev.filter((t) => t.id !== id);
          tablesRef.current = next;
          return next;
        });
        if (newTableIdsRef.current.includes(id)) {
          setNewTableIds((prev) => {
            const next = prev.filter((tid) => tid !== id);
            newTableIdsRef.current = next;
            return next;
          });
        } else {
          setDeletedTableIds((prev) => {
            const next = [...prev, id];
            deletedTableIdsRef.current = next;
            return next;
          });
        }
      } else {
        setElements((prev) => {
          const next = prev.filter((el) => el.id !== id);
          elementsRef.current = next;
          return next;
        });
        if (!newElementIdsRef.current.includes(id)) {
          setDeletedElementIds((prev) => {
            const next = [...prev, id];
            deletedElementIdsRef.current = next;
            return next;
          });
        } else {
          setNewElementIds((prev) => {
            const next = prev.filter((eid) => eid !== id);
            newElementIdsRef.current = next;
            return next;
          });
        }
      }
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedType(null);
      }
      setIsDirty(true);
    },
    [selectedId]
  );

  const handleDuplicate = useCallback(
    (id: string, type: "table" | "element") => {
      if (type === "table") {
        const original = tables.find((t) => t.id === id);
        if (original) {
          const newId = generateId();
          const duplicated: DraggableTable = {
            ...original,
            id: newId,
            tableNumber: `${original.tableNumber}_copy`,
            positionX: original.positionX + 20,
            positionY: original.positionY + 20,
          };
          setTables((prev) => [...prev, duplicated]);
          setNewTableIds((prev) => [...prev, newId]);
          setSelectedId(newId);
        }
      } else {
        const original = elements.find((el) => el.id === id);
        if (original) {
          const newId = generateId();
          const duplicated: DraggableFloorElement = {
            ...original,
            id: newId,
            positionX: original.positionX + 20,
            positionY: original.positionY + 20,
          };
          setElements((prev) => [...prev, duplicated]);
          setNewElementIds((prev) => [...prev, newId]);
          setSelectedId(newId);
          setSelectedType("element");
        }
      }
      setIsDirty(true);
    },
    [tables, elements]
  );

  const handleRotate = useCallback(
    (id: string, type: "table" | "element", degrees: number) => {
      if (type === "table") {
        setTables((prev) => prev.map((t) => (t.id === id ? { ...t, rotation: (t.rotation + degrees) % 360 } : t)));
      } else {
        setElements((prev) => prev.map((el) => (el.id === id ? { ...el, rotation: (el.rotation + degrees) % 360 } : el)));
      }
      setIsDirty(true);
    },
    []
  );

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev + 0.1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(MIN_ZOOM, prev - 0.1));
  }, []);

  const handleToggleGrid = useCallback(() => {
    setShowGrid((prev) => !prev);
  }, []);

  const handleToggleSnap = useCallback(() => {
    setSnapToGrid((prev) => !prev);
  }, []);

  const handlePaintComplete = useCallback(
    (rect: { x: number; y: number; width: number; height: number }, screen: { x: number; y: number }) => {
      setPendingPaintRect(rect);
      setPaintPalettePos({ x: screen.x, y: screen.y });
    },
    []
  );

  const createFloorArea = useCallback(
    (rect: { x: number; y: number; width: number; height: number }, options: { color?: string; imageDataUrl?: string }) => {
      const id = generateId();
      const newElement: DraggableFloorElement = {
        id,
        type: "element",
        elementType: "FLOOR_AREA" as FloorElementType,
        positionX: rect.x,
        positionY: rect.y,
        width: rect.width,
        height: rect.height,
        rotation: 0,
        color: options.color,
        icon: options.imageDataUrl,
      };

      setElements((prev) => {
        const next = [...prev, newElement];
        elementsRef.current = next;
        return next;
      });
      setNewElementIds((prev) => {
        const next = [...prev, id];
        newElementIdsRef.current = next;
        return next;
      });
      setSelectedId(id);
      setSelectedType("element");
      setIsDirty(true);
    },
    []
  );

  const handlePaintImageSelected = useCallback(
    (file: File) => {
      if (!pendingPaintRect) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : null;
        if (!result) return;
        createFloorArea(pendingPaintRect, { imageDataUrl: result });
        setPendingPaintRect(null);
        setPaintPalettePos(null);
      };
      reader.readAsDataURL(file);
    },
    [pendingPaintRect, createFloorArea]
  );

  const handleCanvasSizeChange = useCallback((width: number, height: number) => {
    setCanvasWidth(width);
    setCanvasHeight(height);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const tableData = tablesRef.current.map((t) => ({
        id: t.id,
        positionX: t.positionX,
        positionY: t.positionY,
        width: t.width,
        height: t.height,
        rotation: t.rotation,
        shape: t.shape,
        tableNumber: t.tableNumber,
        capacity: t.capacity,
      }));

      const newElements = elementsRef.current
        .filter((el) => newElementIdsRef.current.includes(el.id))
        .map((el) => ({
          type: el.elementType,
          label: el.label,
          positionX: el.positionX,
          positionY: el.positionY,
          width: el.width,
          height: el.height,
          rotation: el.rotation,
          color: el.color,
          icon: el.icon,
        }));

      const existingElements = elementsRef.current
        .filter((el) => !newElementIdsRef.current.includes(el.id))
        .map((el) => ({
          id: el.id,
          zoneId,
          type: el.elementType,
          label: el.label,
          positionX: el.positionX,
          positionY: el.positionY,
          width: el.width,
          height: el.height,
          rotation: el.rotation,
          color: el.color,
          icon: el.icon,
          createdAt: "",
          updatedAt: "",
        })) as FloorElement[];

      await onSave?.({
        canvasSettings: {
          canvasWidth,
          canvasHeight,
          ...(backgroundSvg ? { backgroundImage: backgroundSvg } : {}),
        },
        tables: tableData,
        deletedTableIds: deletedTableIdsRef.current,
        floorElements: existingElements,
        deletedElementIds: deletedElementIdsRef.current,
        newElements,
      });

      setIsDirty(false);
    } catch {
    } finally {
      setSaving(false);
    }
  }, [canvasWidth, canvasHeight, zoneId, onSave, backgroundSvg]);

  const handleSaveAndClose = useCallback(async () => {
    await handleSave();
    onCancel();
  }, [handleSave, onCancel]);

  const handleEditMode = useCallback(() => {
    onRequestEditMode?.();
  }, [onRequestEditMode]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#f9fafb] flex flex-col"
      style={{ position: "fixed", inset: 0, zIndex: 50, backgroundColor: "#f9fafb", display: "flex", flexDirection: "column" }}
    >
      <div
        className="flex items-center justify-between px-3 md:px-4 py-2 md:py-3 bg-[#f9fafb] border-b border-[#ddd]"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", backgroundColor: "#f9fafb", borderBottom: "1px solid #ddd" }}
      >
        <div className="min-w-0 flex-1">
          <h1 className="text-gray-900 font-semibold text-base md:text-lg truncate">
            {readOnly
              ? t("admin.tableManagement.floorPlan.viewFloorPlan")
              : t("admin.tableManagement.floorPlan.editFloorPlan")}
          </h1>
          <p className="text-gray-600 text-xs md:text-sm truncate">
            {t("admin.reservations.zone")}: {zoneName}
          </p>
        </div>
      </div>

      <Toolbar
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        zoom={zoom}
        showGrid={showGrid}
        snapToGrid={snapToGrid}
        saving={saving}
        isDirty={isDirty}
        isMobile={isMobile}
        paintMode={paintMode}
        onTogglePaintMode={readOnly ? undefined : () => setPaintMode((p) => !p)}
        onAddTable={readOnly ? undefined : handleAddTable}
        onAddElement={readOnly ? undefined : handleAddElement}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onToggleGrid={handleToggleGrid}
        onToggleSnap={handleToggleSnap}
        onCanvasSizeChange={readOnly ? undefined : handleCanvasSizeChange}
        onSave={readOnly ? undefined : handleSave}
        onSaveAndClose={readOnly ? undefined : handleSaveAndClose}
        onEditMode={readOnly ? handleEditMode : undefined}
        onCancel={onCancel}
      />

      <div
        className="flex-1 flex overflow-hidden min-h-0"
        style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}
      >
        <div
          className="flex-1 relative min-h-0 bg-gray-50"
          style={{ flex: 1, position: "relative", minHeight: 0, backgroundColor: "#f9fafb" }}
        >
          <Canvas
            width={canvasWidth}
            height={canvasHeight}
            zoom={zoom}
            showGrid={showGrid}
            snapToGrid={snapToGrid}
            backgroundSvg={backgroundSvg}
            readOnly={readOnly}
            paintMode={paintMode}
            onPaintComplete={readOnly ? undefined : handlePaintComplete}
            tables={tables}
            floorElements={elements}
            selectedItem={selectedItem}
            onSelectItem={handleSelectItem}
            onMoveItem={readOnly ? (() => {}) : handleMoveItem}
          />

          {paintMode && pendingPaintRect && paintPalettePos && (
            <div
              style={{
                position: "fixed",
                left: paintPalettePos.x,
                top: paintPalettePos.y,
                transform: "translate(-50%, 12px)",
                zIndex: 200,
              }}
              className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg"
            >
              <div className="flex flex-wrap gap-2" style={{ maxWidth: 280 }}>
                {FLOOR_COLOR_PALETTE.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => {
                      createFloorArea(pendingPaintRect, { color: c.value });
                      setPendingPaintRect(null);
                      setPaintPalettePos(null);
                    }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      background: c.value,
                      border: "1px solid rgba(255,255,255,0.15)",
                    }}
                    title={c.name}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => paintImageInputRef.current?.click()}
                  className="text-xs text-gray-600 px-2 py-1 rounded bg-gray-100 border border-gray-300"
                >
                  {t("admin.tableManagement.floorPlan.image", { defaultValue: "Image" })}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPendingPaintRect(null);
                    setPaintPalettePos(null);
                  }}
                  className="text-xs text-gray-600 px-2 py-1 rounded bg-gray-100 border border-gray-300"
                >
                  {t("admin.tableManagement.floorPlan.cancel", { defaultValue: "Cancel" })}
                </button>

                <input
                  ref={paintImageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    handlePaintImageSelected(file);
                    e.currentTarget.value = "";
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {!isMobile && !readOnly ? (
          <PropertiesPanel
            selectedItem={selectedItem}
            onUpdateTable={handleUpdateTable}
            onUpdateElement={handleUpdateElement}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onRotate={handleRotate}
            isMobile={isMobile}
          />
        ) : null}

        {isMobile && !readOnly ? (
          <Sheet open={isPropertiesPanelOpen} onOpenChange={setIsPropertiesPanelOpen}>
            <SheetContent
              side="bottom"
              hideOverlay={true}
              className="bg-white border-t border-gray-200 text-gray-900 rounded-t-3xl p-0 max-h-[70vh] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>
                  {t("admin.tableManagement.floorPlan.properties", {
                    defaultValue: "Properties",
                  })}
                </SheetTitle>
                <SheetDescription>
                  {t("admin.tableManagement.floorPlan.propertiesDescription", {
                    defaultValue: "Edit selected item properties",
                  })}
                </SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto max-h-[calc(70vh-2rem)] pt-8">
                <PropertiesPanel
                  selectedItem={selectedItem}
                  onUpdateTable={handleUpdateTable}
                  onUpdateElement={handleUpdateElement}
                  onDelete={(id, type) => {
                    handleDelete(id, type);
                    setIsPropertiesPanelOpen(false);
                  }}
                  onDuplicate={handleDuplicate}
                  onRotate={handleRotate}
                  isMobile={true}
                />
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
    </div>
  );
};

export default FloorPlanEditor;
