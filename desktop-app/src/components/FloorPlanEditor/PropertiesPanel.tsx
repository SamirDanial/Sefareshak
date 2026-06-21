import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@mdi/react";
import {
  mdiDelete,
  mdiContentCopy,
  mdiRotateRight,
  mdiTableFurniture,
  mdiShape,
} from "@mdi/js";
import type {
  DraggableTable,
  DraggableFloorElement,
  SelectedItem,
  TableShape,
} from "./types";
import { TABLE_SHAPES } from "./types";
import type { FloorElementType } from "@/services/reservationService";

const DEFAULT_ELEMENT_COLORS: Partial<Record<FloorElementType, string>> = {
  WINDOW: "#60a5fa",
  DOOR: "#a78bfa",
  STAIRS: "#6b7280",
  GARDEN: "#34d399",
  WALL: "#9ca3af",
  BAR: "#f59e0b",
  KITCHEN: "#ef4444",
  RESTROOM: "#3b82f6",
  PLANT: "#22c55e",
  PILLAR: "#78716c",
  LABEL: "#fbbf24",
  FLOOR_AREA: "#374151",
};

interface PropertiesPanelProps {
  selectedItem: SelectedItem;
  onUpdateTable: (id: string, updates: Partial<DraggableTable>) => void;
  onUpdateElement: (id: string, updates: Partial<DraggableFloorElement>) => void;
  onDelete: (id: string, type: "table" | "element") => void;
  onDuplicate: (id: string, type: "table" | "element") => void;
  onRotate: (id: string, type: "table" | "element", degrees: number) => void;
  isMobile?: boolean;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedItem,
  onUpdateTable,
  onUpdateElement,
  onDelete,
  onDuplicate,
  onRotate,
  isMobile = false,
}) => {
  const { t } = useTranslation();

  const [inputValues, setInputValues] = React.useState({
    x: "",
    y: "",
    width: "",
    height: "",
    capacity: "",
  });

  React.useEffect(() => {
    if (!selectedItem) return;
    setInputValues({
      x: String(Math.round(selectedItem.positionX)),
      y: String(Math.round(selectedItem.positionY)),
      width: String(Math.round(selectedItem.width)),
      height: String(Math.round(selectedItem.height)),
      capacity:
        selectedItem.type === "table"
          ? String((selectedItem as DraggableTable).capacity ?? "")
          : "",
    });
  }, [selectedItem?.id]);

  if (!selectedItem) {
    if (isMobile) {
      return (
        <div className="p-4 flex flex-col items-center justify-center text-gray-500">
          <Icon path={mdiShape} size={1.5} className="opacity-30 mb-2" />
          <p className="text-sm text-center">
            {t("admin.tableManagement.floorPlan.selectElement")}
          </p>
        </div>
      );
    }
    return (
      <div className="w-64 bg-white border-l border-gray-200 p-4 flex flex-col items-center justify-center text-gray-500">
        <Icon path={mdiShape} size={2} className="opacity-30 mb-4" />
        <p className="text-sm text-center">
          {t("admin.tableManagement.floorPlan.selectElement")}
        </p>
      </div>
    );
  }

  const isTable = selectedItem.type === "table";
  const table = isTable ? (selectedItem as DraggableTable) : null;
  const element = !isTable ? (selectedItem as DraggableFloorElement) : null;

  const effectiveElementColor =
    !isTable && element
      ? element.color || DEFAULT_ELEMENT_COLORS[element.elementType] || "#6b7280"
      : "#6b7280";

  if (isMobile) {
    return (
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
          <Icon
            path={isTable ? mdiTableFurniture : mdiShape}
            size={0.8}
            className="text-pink-500"
          />
          <h3 className="text-gray-900 font-medium flex-1">
            {isTable
              ? `${t("admin.tableManagement.floorPlan.table", "Table")} ${table?.tableNumber}`
              : t(
                  `admin.tableManagement.floorPlan.elements.${element?.elementType?.toLowerCase()}`,
                  {
                    defaultValue: element?.elementType || "",
                  }
                )}
          </h3>
        </div>

        <div className="space-y-3">
          {isTable && table && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="tableNumber-mobile" className="text-gray-500 text-xs">
                  {t("admin.tableManagement.floorPlan.tableNumber")}
                </Label>
                <Input
                  id="tableNumber-mobile"
                  value={table.tableNumber}
                  onChange={(e) =>
                    onUpdateTable(table.id, { tableNumber: e.target.value })
                  }
                  className="bg-white border-gray-300 text-gray-900 h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="capacity-mobile" className="text-gray-500 text-xs">
                  {t("admin.tableManagement.floorPlan.capacity")}
                </Label>
                <Input
                  id="capacity-mobile"
                  type="number"
                  max={20}
                  value={inputValues.capacity}
                  onChange={(e) => {
                    const v = e.target.value;
                    setInputValues((prev) => ({ ...prev, capacity: v }));
                    if (v.trim() === "") return;
                    const parsed = parseInt(v, 10);
                    if (Number.isNaN(parsed)) return;
                    onUpdateTable(table.id, { capacity: parsed });
                  }}
                  className="bg-white border-gray-300 text-gray-900 h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="shape-mobile" className="text-gray-500 text-xs">
                  {t("admin.tableManagement.floorPlan.shape")}
                </Label>
                <Select
                  value={table.shape}
                  onValueChange={(v) =>
                    onUpdateTable(table.id, { shape: v as TableShape })
                  }
                >
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200 text-gray-900">
                    {TABLE_SHAPES.map((shape) => (
                      <SelectItem key={shape.value} value={shape.value}>
                        {t(
                          `admin.tableManagement.floorPlan.${shape.value.toLowerCase()}`
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {!isTable && element && element.elementType === "LABEL" && (
            <div className="space-y-1">
              <Label htmlFor="label-mobile" className="text-gray-500 text-xs">
                {t("admin.tableManagement.floorPlan.labelText")}
              </Label>
              <Input
                id="label-mobile"
                value={element.label || ""}
                onChange={(e) =>
                  onUpdateElement(element.id, { label: e.target.value })
                }
                className="bg-white border-gray-300 text-gray-900 h-9 text-sm"
              />
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-gray-500 text-xs">X</Label>
              <Input
                type="number"
                value={inputValues.x}
                onChange={(e) => {
                  const v = e.target.value;
                  setInputValues((prev) => ({ ...prev, x: v }));
                  if (v.trim() === "") return;
                  const value = parseInt(v, 10);
                  if (Number.isNaN(value)) return;
                  if (isTable) {
                    onUpdateTable(selectedItem.id, { positionX: value });
                  } else {
                    onUpdateElement(selectedItem.id, { positionX: value });
                  }
                }}
                className="bg-white border-gray-300 text-gray-900 h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-500 text-xs">Y</Label>
              <Input
                type="number"
                value={inputValues.y}
                onChange={(e) => {
                  const v = e.target.value;
                  setInputValues((prev) => ({ ...prev, y: v }));
                  if (v.trim() === "") return;
                  const value = parseInt(v, 10);
                  if (Number.isNaN(value)) return;
                  if (isTable) {
                    onUpdateTable(selectedItem.id, { positionY: value });
                  } else {
                    onUpdateElement(selectedItem.id, { positionY: value });
                  }
                }}
                className="bg-white border-gray-300 text-gray-900 h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-500 text-xs">
                {t("admin.tableManagement.floorPlan.width")}
              </Label>
              <Input
                type="number"
                value={inputValues.width}
                onChange={(e) => {
                  const v = e.target.value;
                  setInputValues((prev) => ({ ...prev, width: v }));
                  if (v.trim() === "") return;
                  const value = parseInt(v, 10);
                  if (Number.isNaN(value)) return;
                  if (isTable) {
                    onUpdateTable(selectedItem.id, { width: value });
                  } else {
                    onUpdateElement(selectedItem.id, { width: value });
                  }
                }}
                className="bg-white border-gray-300 text-gray-900 h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-500 text-xs">
                {t("admin.tableManagement.floorPlan.height")}
              </Label>
              <Input
                type="number"
                value={inputValues.height}
                onChange={(e) => {
                  const v = e.target.value;
                  setInputValues((prev) => ({ ...prev, height: v }));
                  if (v.trim() === "") return;
                  const value = parseInt(v, 10);
                  if (Number.isNaN(value)) return;
                  if (isTable) {
                    onUpdateTable(selectedItem.id, { height: value });
                  } else {
                    onUpdateElement(selectedItem.id, { height: value });
                  }
                }}
                className="bg-white border-gray-300 text-gray-900 h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-gray-500 text-xs">
              {t("admin.tableManagement.floorPlan.rotation")} ({selectedItem.rotation}°)
            </Label>
            <input
              type="range"
              min={0}
              max={360}
              step={15}
              value={selectedItem.rotation}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (isTable) {
                  onUpdateTable(selectedItem.id, { rotation: value });
                } else {
                  onUpdateElement(selectedItem.id, { rotation: value });
                }
              }}
              className="w-full accent-pink-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRotate(selectedItem.id, selectedItem.type, 45)}
              className="flex-1 bg-white border-gray-300 hover:bg-gray-50 text-gray-700 text-xs h-9"
            >
              <Icon path={mdiRotateRight} size={0.6} className="mr-1" />
              +45°
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDuplicate(selectedItem.id, selectedItem.type)}
              className="flex-1 bg-white border-gray-300 hover:bg-gray-50 text-gray-700 text-xs h-9"
            >
              <Icon path={mdiContentCopy} size={0.6} className="mr-1" />
              {t("admin.tableManagement.floorPlan.copy", "Copy")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(selectedItem.id, selectedItem.type)}
              className="flex-1 bg-red-50 border-red-200 hover:bg-red-100 text-red-600 text-xs h-9"
            >
              <Icon path={mdiDelete} size={0.6} className="mr-1" />
              {t("admin.tableManagement.floorPlan.delete")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-l border-gray-200 p-4 overflow-y-auto">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
        <Icon
          path={isTable ? mdiTableFurniture : mdiShape}
          size={0.8}
          className="text-pink-500"
        />
        <h3 className="text-gray-900 font-medium">
          {isTable
            ? `${t("admin.tableManagement.floorPlan.table", "Table")} ${table?.tableNumber}`
            : t(
                `admin.tableManagement.floorPlan.elements.${element?.elementType?.toLowerCase()}`,
                {
                  defaultValue: element?.elementType || "",
                }
              )}
        </h3>
      </div>

      <div className="space-y-4">
        {isTable && table && (
          <>
            <div className="space-y-2">
              <Label htmlFor="tableNumber" className="text-gray-500 text-xs">
                {t("admin.tableManagement.floorPlan.tableNumber")}
              </Label>
              <Input
                id="tableNumber"
                value={table.tableNumber}
                onChange={(e) =>
                  onUpdateTable(table.id, { tableNumber: e.target.value })
                }
                className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity" className="text-gray-500 text-xs">
                {t("admin.tableManagement.floorPlan.capacity")}
              </Label>
              <Input
                id="capacity"
                type="number"
                max={20}
                value={inputValues.capacity}
                onChange={(e) => {
                  const v = e.target.value;
                  setInputValues((prev) => ({ ...prev, capacity: v }));
                  if (v.trim() === "") return;
                  const parsed = parseInt(v, 10);
                  if (Number.isNaN(parsed)) return;
                  onUpdateTable(table.id, { capacity: parsed });
                }}
                className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shape" className="text-gray-500 text-xs">
                {t("admin.tableManagement.floorPlan.shape")}
              </Label>
              <Select
                value={table.shape}
                onValueChange={(v) =>
                  onUpdateTable(table.id, { shape: v as TableShape })
                }
              >
                <SelectTrigger className="bg-white border-gray-300 text-gray-900 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200 text-gray-900">
                  {TABLE_SHAPES.map((shape) => (
                    <SelectItem key={shape.value} value={shape.value}>
                      {t(`admin.tableManagement.floorPlan.${shape.value.toLowerCase()}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {!isTable && element && (
          <>
            <div className="space-y-2">
              <Label className="text-gray-500 text-xs">
                {t("admin.tableManagement.floorPlan.type", "Type")}
              </Label>
              <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm">
                {t(
                  `admin.tableManagement.floorPlan.elements.${element.elementType.toLowerCase()}`,
                  element.elementType
                )}
              </div>
            </div>

            {(element.elementType === "LABEL" || element.label) && (
              <div className="space-y-2">
                <Label htmlFor="label" className="text-gray-500 text-xs">
                  {t("admin.tableManagement.floorPlan.labelText")}
                </Label>
                <Input
                  id="label"
                  value={element.label || ""}
                  onChange={(e) =>
                    onUpdateElement(element.id, { label: e.target.value })
                  }
                  className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="color" className="text-gray-500 text-xs">
                {t("admin.tableManagement.floorPlan.color")}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="color"
                  type="color"
                  value={effectiveElementColor}
                  onChange={(e) =>
                    onUpdateElement(element.id, { color: e.target.value })
                  }
                  className="bg-white border-gray-300 h-8 w-12 p-1 cursor-pointer"
                />
                <Input
                  value={effectiveElementColor}
                  onChange={(e) =>
                    onUpdateElement(element.id, { color: e.target.value })
                  }
                  className="bg-white border-gray-300 text-gray-900 h-8 text-sm flex-1"
                />
              </div>
            </div>
          </>
        )}

        <div className="pt-2 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-gray-500 text-xs">X</Label>
              <Input
                type="number"
                value={inputValues.x}
                onChange={(e) => {
                  const v = e.target.value;
                  setInputValues((prev) => ({ ...prev, x: v }));
                  if (v.trim() === "") return;
                  const value = parseInt(v, 10);
                  if (Number.isNaN(value)) return;
                  if (isTable) {
                    onUpdateTable(selectedItem.id, { positionX: value });
                  } else {
                    onUpdateElement(selectedItem.id, { positionX: value });
                  }
                }}
                className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-500 text-xs">Y</Label>
              <Input
                type="number"
                value={inputValues.y}
                onChange={(e) => {
                  const v = e.target.value;
                  setInputValues((prev) => ({ ...prev, y: v }));
                  if (v.trim() === "") return;
                  const value = parseInt(v, 10);
                  if (Number.isNaN(value)) return;
                  if (isTable) {
                    onUpdateTable(selectedItem.id, { positionY: value });
                  } else {
                    onUpdateElement(selectedItem.id, { positionY: value });
                  }
                }}
                className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-gray-500 text-xs">
              {t("admin.tableManagement.floorPlan.width")}
            </Label>
            <Input
              type="number"
              value={inputValues.width}
              onChange={(e) => {
                const v = e.target.value;
                setInputValues((prev) => ({ ...prev, width: v }));
                if (v.trim() === "") return;
                const value = parseInt(v, 10);
                if (Number.isNaN(value)) return;
                if (isTable) {
                  onUpdateTable(selectedItem.id, { width: value });
                } else {
                  onUpdateElement(selectedItem.id, { width: value });
                }
              }}
              className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-gray-500 text-xs">
              {t("admin.tableManagement.floorPlan.height")}
            </Label>
            <Input
              type="number"
              value={inputValues.height}
              onChange={(e) => {
                const v = e.target.value;
                setInputValues((prev) => ({ ...prev, height: v }));
                if (v.trim() === "") return;
                const value = parseInt(v, 10);
                if (Number.isNaN(value)) return;
                if (isTable) {
                  onUpdateTable(selectedItem.id, { height: value });
                } else {
                  onUpdateElement(selectedItem.id, { height: value });
                }
              }}
              className="bg-white border-gray-300 text-gray-900 h-8 text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-gray-500 text-xs">
            {t("admin.tableManagement.floorPlan.rotation")} ({selectedItem.rotation}°)
          </Label>
          <input
            type="range"
            min={0}
            max={360}
            step={15}
            value={selectedItem.rotation}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (isTable) {
                onUpdateTable(selectedItem.id, { rotation: value });
              } else {
                onUpdateElement(selectedItem.id, { rotation: value });
              }
            }}
            className="w-full accent-pink-500"
          />
        </div>

        <div className="pt-3 border-t border-gray-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRotate(selectedItem.id, selectedItem.type, 45)}
              className="bg-white border-gray-300 hover:bg-gray-50 text-gray-700 text-xs"
            >
              <Icon path={mdiRotateRight} size={0.6} className="mr-1" />
              +45°
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDuplicate(selectedItem.id, selectedItem.type)}
              className="bg-white border-gray-300 hover:bg-gray-50 text-gray-700 text-xs"
            >
              <Icon path={mdiContentCopy} size={0.6} className="mr-1" />
              {t("admin.tableManagement.floorPlan.copy", "Copy")}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(selectedItem.id, selectedItem.type)}
            className="w-full bg-red-50 border-red-200 hover:bg-red-100 text-red-600 text-xs"
          >
            <Icon path={mdiDelete} size={0.6} className="mr-1" />
            {t("admin.tableManagement.floorPlan.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
};
