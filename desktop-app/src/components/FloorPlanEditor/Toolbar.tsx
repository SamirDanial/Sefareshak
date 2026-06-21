import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@mdi/react";
import {
  mdiPlus,
  mdiChevronDown,
  mdiGrid,
  mdiMagnifyPlus,
  mdiMagnifyMinus,
  mdiContentSave,
  mdiClose,
  mdiWindowClosed,
  mdiDoorOpen,
  mdiStairs,
  mdiFlower,
  mdiWall,
  mdiGlassCocktail,
  mdiStove,
  mdiToilet,
  mdiFlowerTulip,
  mdiPillar,
  mdiLabel,
  mdiTableFurniture,
  mdiResize,
  mdiBrush,
  mdiPencil,
} from "@mdi/js";
import type { FloorElementType } from "@/services/reservationService";
import type { TableShape } from "./types";
import {
  FLOOR_ELEMENT_TYPES,
  TABLE_SHAPES,
  MIN_ZOOM,
  MAX_ZOOM,
  MIN_CANVAS_SIZE,
  MAX_CANVAS_SIZE,
} from "./types";

const ELEMENT_ICONS: Record<FloorElementType, string> = {
  WINDOW: mdiWindowClosed,
  DOOR: mdiDoorOpen,
  STAIRS: mdiStairs,
  GARDEN: mdiFlower,
  WALL: mdiWall,
  BAR: mdiGlassCocktail,
  KITCHEN: mdiStove,
  RESTROOM: mdiToilet,
  PLANT: mdiFlowerTulip,
  PILLAR: mdiPillar,
  LABEL: mdiLabel,
  FLOOR_AREA: mdiBrush,
};

interface ToolbarProps {
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  showGrid: boolean;
  snapToGrid: boolean;
  saving: boolean;
  isDirty?: boolean;
  isMobile?: boolean;
  paintMode?: boolean;
  onTogglePaintMode?: () => void;
  onAddTable?: (tableNumber: string, capacity: number, shape: TableShape) => void;
  onAddElement?: (type: FloorElementType, label?: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onCanvasSizeChange?: (width: number, height: number) => void;
  onSave?: () => void;
  onSaveAndClose?: () => void;
  onEditMode?: () => void;
  onCancel: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  canvasWidth,
  canvasHeight,
  zoom,
  showGrid,
  snapToGrid,
  saving,
  isDirty = false,
  isMobile = false,
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
  onSaveAndClose,
  onEditMode,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [isTableDialogOpen, setIsTableDialogOpen] = useState(false);
  const [isCanvasSizeDialogOpen, setIsCanvasSizeDialogOpen] = useState(false);
  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("2");
  const [newTableShape, setNewTableShape] = useState<TableShape>("SQUARE");
  const [newCanvasWidth, setNewCanvasWidth] = useState(String(canvasWidth));
  const [newCanvasHeight, setNewCanvasHeight] = useState(String(canvasHeight));
  const [newLabelText, setNewLabelText] = useState("");

  const handleAddTable = () => {
    if (!onAddTable) return;
    if (!newTableNumber.trim()) return;
    const parsedCapacity = parseInt(newTableCapacity, 10);
    const capacity = Number.isNaN(parsedCapacity) ? 2 : parsedCapacity;
    onAddTable(newTableNumber.trim(), capacity, newTableShape);
    setNewTableNumber("");
    setNewTableCapacity("2");
    setNewTableShape("SQUARE");
    setIsTableDialogOpen(false);
  };

  const handleAddElement = (type: FloorElementType) => {
    if (!onAddElement) return;
    if (type === "LABEL") {
      setIsLabelDialogOpen(true);
    } else {
      onAddElement(type);
    }
  };

  const handleAddLabel = () => {
    if (!onAddElement) return;
    onAddElement("LABEL", newLabelText || "Label");
    setNewLabelText("");
    setIsLabelDialogOpen(false);
  };

  const handleCanvasSizeChange = () => {
    if (!onCanvasSizeChange) return;
    const parsedWidth = parseInt(newCanvasWidth, 10);
    const parsedHeight = parseInt(newCanvasHeight, 10);

    const width = Math.max(
      MIN_CANVAS_SIZE,
      Math.min(MAX_CANVAS_SIZE, Number.isNaN(parsedWidth) ? canvasWidth : parsedWidth)
    );
    const height = Math.max(
      MIN_CANVAS_SIZE,
      Math.min(MAX_CANVAS_SIZE, Number.isNaN(parsedHeight) ? canvasHeight : parsedHeight)
    );
    onCanvasSizeChange(width, height);
    setIsCanvasSizeDialogOpen(false);
  };

  return (
    <>
      {isMobile ? (
        <div className="flex items-center justify-between p-3 bg-white border-b border-gray-200">
          <div className="flex items-center gap-1 bg-gray-100 rounded-md px-1.5 py-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onZoomOut}
              disabled={zoom <= MIN_ZOOM}
              className="h-7 w-7 p-0 hover:bg-gray-200 text-gray-700"
            >
              <Icon path={mdiMagnifyMinus} size={0.55} />
            </Button>
            <span className="text-xs text-gray-500 min-w-[40px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onZoomIn}
              disabled={zoom >= MAX_ZOOM}
              className="h-7 w-7 p-0 hover:bg-gray-200 text-gray-700"
            >
              <Icon path={mdiMagnifyPlus} size={0.55} />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="bg-white border-gray-300 hover:bg-gray-50! hover:text-gray-900! text-gray-700"
            >
              <Icon path={mdiClose} size={0.7} className="mr-1.5" />
              {onSave ? t("admin.tableManagement.floorPlan.cancel") : t("common.close", { defaultValue: "Close" })}
            </Button>
            {onSave ? (
              <>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={saving || !isDirty}
                  className="bg-pink-600 hover:bg-pink-700 text-white"
                >
                  <Icon path={mdiContentSave} size={0.7} className="mr-1.5" />
                  {saving ? "..." : t("admin.tableManagement.floorPlan.save")}
                </Button>
                <Button
                  size="sm"
                  onClick={onSaveAndClose}
                  disabled={saving || !isDirty}
                  className="bg-pink-700 hover:bg-pink-800 text-white"
                >
                  <Icon path={mdiContentSave} size={0.7} className="mr-1.5" />
                  {t("admin.tableManagement.floorPlan.saveAndClose", { defaultValue: "Save & Close" })}
                </Button>
              </>
            ) : onEditMode ? (
              <Button
                size="sm"
                onClick={onEditMode}
                className="bg-pink-600 hover:bg-pink-700 text-white"
              >
                <Icon path={mdiPencil} size={0.7} className="mr-1.5" />
                {t("admin.tableManagement.floorPlan.editMode", { defaultValue: "Edit Mode" })}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        /* Desktop Toolbar */
        <div className="flex items-center justify-between gap-4 p-3 bg-white border-b border-gray-200 flex-wrap">
          <div className="flex items-center gap-2">
            {onSave && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onTogglePaintMode?.()}
                  className={`border-gray-300 ${
                    paintMode
                      ? "bg-pink-600 hover:bg-pink-700 text-white"
                      : "bg-white hover:bg-gray-50! text-gray-700"
                  }`}
                >
                  <Icon path={mdiBrush} size={0.7} className="mr-1.5" />
                  {t("admin.tableManagement.floorPlan.paintArea", { defaultValue: "Paint Area" })}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTableDialogOpen(true)}
                  className="bg-white border-gray-300 hover:bg-gray-50! text-gray-700"
                >
                  <Icon path={mdiTableFurniture} size={0.7} className="mr-1.5" />
                  {t("admin.tableManagement.floorPlan.addTable")}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white border-gray-300 hover:bg-gray-50! text-gray-700"
                    >
                      <Icon path={mdiPlus} size={0.7} className="mr-1.5" />
                      {t("admin.tableManagement.floorPlan.addElement")}
                      <Icon path={mdiChevronDown} size={0.5} className="ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-white border-gray-200 text-gray-900 max-h-[60vh] overflow-y-auto">
                    {FLOOR_ELEMENT_TYPES.map((element) => (
                      <DropdownMenuItem
                        key={element.type}
                        onClick={() => handleAddElement(element.type)}
                        className="hover:bg-gray-100 focus:bg-gray-100 cursor-pointer"
                      >
                        <Icon path={ELEMENT_ICONS[element.type]} size={0.7} className="mr-2" />
                        {t(`admin.tableManagement.floorPlan.elements.${element.type.toLowerCase()}`)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewCanvasWidth(String(canvasWidth));
                    setNewCanvasHeight(String(canvasHeight));
                    setIsCanvasSizeDialogOpen(true);
                  }}
                  className="bg-white border-gray-300 hover:bg-gray-50! text-gray-700"
                >
                  <Icon path={mdiResize} size={0.7} className="mr-1.5" />
                  {canvasWidth} × {canvasHeight}
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleGrid}
              className={`border-gray-300 ${
                showGrid
                  ? "bg-pink-600 hover:bg-pink-700 hover:text-white! text-white"
                  : "bg-white hover:bg-gray-50! hover:text-gray-900! text-gray-700"
              }`}
            >
              <Icon path={mdiGrid} size={0.7} className="mr-1.5" />
              {showGrid
                ? t("admin.tableManagement.floorPlan.hideGrid")
                : t("admin.tableManagement.floorPlan.showGrid")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onToggleSnap}
              className={`border-gray-300 ${
                snapToGrid
                  ? "bg-pink-600 hover:bg-pink-700 hover:text-white! text-white"
                  : "bg-white hover:bg-gray-50! hover:text-gray-900! text-gray-700"
              }`}
            >
              {t("admin.tableManagement.floorPlan.snapToGrid")}
            </Button>

            <div className="w-px h-6 bg-gray-300 mx-1" />

            <div className="flex items-center gap-1 bg-gray-100 rounded-md px-1.5 py-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={onZoomOut}
                disabled={zoom <= MIN_ZOOM}
                className="h-7 w-7 p-0 hover:bg-gray-200 text-gray-700"
              >
                <Icon path={mdiMagnifyMinus} size={0.55} />
              </Button>
              <span className="text-xs text-gray-500 min-w-[40px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onZoomIn}
                disabled={zoom >= MAX_ZOOM}
                className="h-7 w-7 p-0 hover:bg-gray-200 text-gray-700"
              >
                <Icon path={mdiMagnifyPlus} size={0.55} />
              </Button>
            </div>

            <div className="w-px h-6 bg-gray-300 mx-1" />

            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="bg-white border-gray-300 hover:bg-gray-50! text-gray-700"
            >
              <Icon path={mdiClose} size={0.7} className="mr-1.5" />
              {onSave ? t("admin.tableManagement.floorPlan.cancel") : t("common.close", { defaultValue: "Close" })}
            </Button>
            {onSave ? (
              <>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={saving || !isDirty}
                  className="bg-pink-600 hover:bg-pink-700 text-white"
                >
                  <Icon path={mdiContentSave} size={0.7} className="mr-1.5" />
                  {saving
                    ? t("admin.tableManagement.floorPlan.saving")
                    : t("admin.tableManagement.floorPlan.save")}
                </Button>
                <Button
                  size="sm"
                  onClick={onSaveAndClose}
                  disabled={saving || !isDirty}
                  className="bg-pink-700 hover:bg-pink-800 text-white"
                >
                  <Icon path={mdiContentSave} size={0.7} className="mr-1.5" />
                  {t("admin.tableManagement.floorPlan.saveAndClose", { defaultValue: "Save & Close" })}
                </Button>
              </>
            ) : onEditMode ? (
              <Button
                size="sm"
                onClick={onEditMode}
                className="bg-pink-600 hover:bg-pink-700 text-white"
              >
                <Icon path={mdiPencil} size={0.7} className="mr-1.5" />
                {t("admin.tableManagement.floorPlan.editMode", { defaultValue: "Edit Mode" })}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <Dialog open={isTableDialogOpen} onOpenChange={setIsTableDialogOpen}>
        <DialogContent className="bg-white border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle>{t("admin.tableManagement.floorPlan.addTable")}</DialogTitle>
            <DialogDescription className="text-gray-500">
              {t(
                "admin.tableManagement.floorPlan.addTableDescription",
                "Create a new table for this zone's floor plan."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="tableNumber">{t("admin.tableManagement.floorPlan.tableNumber")}</Label>
              <Input
                id="tableNumber"
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(e.target.value)}
                placeholder="e.g., T1, A1, 101"
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">{t("admin.tableManagement.floorPlan.capacity")}</Label>
              <Input
                id="capacity"
                type="number"
                max={20}
                value={newTableCapacity}
                onChange={(e) => setNewTableCapacity(e.target.value)}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shape">{t("admin.tableManagement.floorPlan.shape")}</Label>
              <Select value={newTableShape} onValueChange={(v) => setNewTableShape(v as TableShape)}>
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
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
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsTableDialogOpen(false)}
                className="bg-white border-gray-300 hover:bg-gray-50! text-gray-700"
              >
                {t("admin.tableManagement.floorPlan.cancel")}
              </Button>
              <Button
                onClick={handleAddTable}
                disabled={!newTableNumber.trim()}
                className="bg-pink-600 hover:bg-pink-700 text-white"
              >
                {t("admin.tableManagement.floorPlan.addTable")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCanvasSizeDialogOpen} onOpenChange={setIsCanvasSizeDialogOpen}>
        <DialogContent className="bg-white border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle>{t("admin.tableManagement.floorPlan.canvasSize")}</DialogTitle>
            <DialogDescription className="text-gray-500">
              {t(
                "admin.tableManagement.floorPlan.canvasSizeDescription",
                "Adjust the size of the floor plan canvas."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="canvasWidth">
                {t("admin.tableManagement.floorPlan.width")} (px)
              </Label>
              <Input
                id="canvasWidth"
                type="number"
                max={MAX_CANVAS_SIZE}
                value={newCanvasWidth}
                onChange={(e) => setNewCanvasWidth(e.target.value)}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="canvasHeight">
                {t("admin.tableManagement.floorPlan.height")} (px)
              </Label>
              <Input
                id="canvasHeight"
                type="number"
                max={MAX_CANVAS_SIZE}
                value={newCanvasHeight}
                onChange={(e) => setNewCanvasHeight(e.target.value)}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
            <p className="text-xs text-gray-400">
              {t("admin.tableManagement.floorPlan.minCanvasSize", {
                min: MIN_CANVAS_SIZE,
                max: MAX_CANVAS_SIZE,
              })}
            </p>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsCanvasSizeDialogOpen(false)}
                className="bg-white border-gray-300 hover:bg-gray-50! text-gray-700"
              >
                {t("admin.tableManagement.floorPlan.cancel")}
              </Button>
              <Button
                onClick={handleCanvasSizeChange}
                className="bg-pink-600 hover:bg-pink-700 text-white"
              >
                {t("admin.tableManagement.floorPlan.apply")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isLabelDialogOpen} onOpenChange={setIsLabelDialogOpen}>
        <DialogContent className="bg-white border-gray-200 text-gray-900">
          <DialogHeader>
            <DialogTitle>{t("admin.tableManagement.floorPlan.addLabel", "Add Label")}</DialogTitle>
            <DialogDescription className="text-gray-500">
              {t(
                "admin.tableManagement.floorPlan.addLabelDescription",
                "Add a text label to the floor plan."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="labelText">{t("admin.tableManagement.floorPlan.labelText")}</Label>
              <Input
                id="labelText"
                value={newLabelText}
                onChange={(e) => setNewLabelText(e.target.value)}
                placeholder="e.g., Entrance, VIP Area"
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsLabelDialogOpen(false)}
                className="bg-white border-gray-300 hover:bg-gray-50! text-gray-700"
              >
                {t("admin.tableManagement.floorPlan.cancel")}
              </Button>
              <Button
                onClick={handleAddLabel}
                className="bg-pink-600 hover:bg-pink-700 text-white"
              >
                {t("admin.tableManagement.floorPlan.addLabel", "Add Label")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
