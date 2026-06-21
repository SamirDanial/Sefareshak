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
  onCancel: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  canvasWidth,
  canvasHeight,
  zoom,
  showGrid,
  snapToGrid,
  saving,
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
      {/* Mobile Toolbar */}
      {isMobile ? (
        <div className="flex flex-col gap-2 p-2 bg-[#1a1a1a] border-b border-[#333]">
          {/* Top Row - Add buttons and Actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {/* Add Table Button - Icon only on mobile */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTableDialogOpen(true)}
                className="bg-[#262626] border-[#404040] hover:bg-[#333] text-white h-9 w-9 p-0"
                title={t("admin.tableManagement.floorPlan.addTable")}
              >
                <Icon path={mdiTableFurniture} size={0.7} />
              </Button>

              {/* Add Element Dropdown - Icon only */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-[#262626] border-[#404040] hover:bg-[#333] text-white h-9 px-2"
                  >
                    <Icon path={mdiPlus} size={0.7} />
                    <Icon path={mdiChevronDown} size={0.5} className="ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#1a1a1a] border-[#333] text-white max-h-[60vh] overflow-y-auto">
                  {FLOOR_ELEMENT_TYPES.map((element) => (
                    <DropdownMenuItem
                      key={element.type}
                      onClick={() => handleAddElement(element.type)}
                      className="hover:bg-[#333] focus:bg-[#333] cursor-pointer"
                    >
                      <Icon
                        path={ELEMENT_ICONS[element.type]}
                        size={0.7}
                        className="mr-2"
                      />
                      {t(`admin.tableManagement.floorPlan.elements.${element.type.toLowerCase()}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-px h-6 bg-[#404040]" />

              {/* Canvas Size - Icon only */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewCanvasWidth(String(canvasWidth));
                  setNewCanvasHeight(String(canvasHeight));
                  setIsCanvasSizeDialogOpen(true);
                }}
                className="bg-[#262626] border-[#404040] hover:bg-[#333] text-white h-9 w-9 p-0"
                title={t("admin.tableManagement.floorPlan.canvasSize")}
              >
                <Icon path={mdiResize} size={0.7} />
              </Button>
            </div>

            {/* Save & Cancel */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="bg-[#262626] border-[#404040] hover:bg-[#333] text-white h-9 w-9 p-0"
              >
                <Icon path={mdiClose} size={0.7} />
              </Button>
              <Button
                size="sm"
                onClick={onSave}
                disabled={saving || !onSave}
                className="bg-pink-600 hover:bg-pink-700 text-white h-9 px-3"
              >
                <Icon path={mdiContentSave} size={0.7} className="mr-1" />
                {saving ? "..." : t("admin.tableManagement.floorPlan.save")}
              </Button>
            </div>
          </div>

          {/* Bottom Row - View Controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTogglePaintMode?.()}
              className={`h-8 w-8 p-0 border-[#404040] ${
                paintMode
                  ? "bg-pink-600 hover:bg-pink-700 text-white"
                  : "bg-[#262626] hover:bg-[#333] text-white"
              }`}
              title={t("admin.tableManagement.floorPlan.paintArea", { defaultValue: "Paint Area" })}
            >
              <Icon path={mdiBrush} size={0.6} />
            </Button>

              {/* Grid Toggle - Icon only */}
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleGrid}
                className={`h-8 w-8 p-0 border-[#404040] ${
                  showGrid
                    ? "bg-pink-600 hover:bg-pink-700 text-white"
                    : "bg-[#262626] hover:bg-[#333] text-white"
                }`}
                title={showGrid ? t("admin.tableManagement.floorPlan.hideGrid") : t("admin.tableManagement.floorPlan.showGrid")}
              >
                <Icon path={mdiGrid} size={0.6} />
              </Button>

              {/* Snap Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleSnap}
                className={`h-8 px-2 text-xs border-[#404040] ${
                  snapToGrid
                    ? "bg-pink-600 hover:bg-pink-700 text-white"
                    : "bg-[#262626] hover:bg-[#333] text-white"
                }`}
              >
                Snap
              </Button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-[#262626] rounded-md px-1.5 py-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={onZoomOut}
                disabled={zoom <= MIN_ZOOM}
                className="h-7 w-7 p-0 hover:bg-[#333] text-white"
              >
                <Icon path={mdiMagnifyMinus} size={0.55} />
              </Button>
              <span className="text-xs text-gray-400 min-w-[40px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onZoomIn}
                disabled={zoom >= MAX_ZOOM}
                className="h-7 w-7 p-0 hover:bg-[#333] text-white"
              >
                <Icon path={mdiMagnifyPlus} size={0.55} />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Desktop Toolbar */
        <div className="flex items-center justify-between gap-4 p-3 bg-[#1a1a1a] border-b border-[#333] flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTogglePaintMode?.()}
              className={`border-[#404040] ${
                paintMode
                  ? "bg-pink-600 hover:bg-pink-700 text-white"
                  : "bg-[#262626] hover:bg-[#333] text-white"
              }`}
            >
              <Icon path={mdiBrush} size={0.7} className="mr-1.5" />
              {t("admin.tableManagement.floorPlan.paintArea", { defaultValue: "Paint Area" })}
            </Button>

            {/* Add Table Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTableDialogOpen(true)}
              className="bg-[#262626] border-[#404040] hover:bg-[#333] text-white"
            >
              <Icon path={mdiTableFurniture} size={0.7} className="mr-1.5" />
              {t("admin.tableManagement.floorPlan.addTable")}
            </Button>

            {/* Add Element Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-[#262626] border-[#404040] hover:bg-[#333] text-white"
                >
                  <Icon path={mdiPlus} size={0.7} className="mr-1.5" />
                  {t("admin.tableManagement.floorPlan.addElement")}
                  <Icon path={mdiChevronDown} size={0.6} className="ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#1a1a1a] border-[#333] text-white">
                {FLOOR_ELEMENT_TYPES.map((element) => (
                  <DropdownMenuItem
                    key={element.type}
                    onClick={() => handleAddElement(element.type)}
                    className="hover:bg-[#333] focus:bg-[#333] cursor-pointer"
                  >
                    <Icon
                      path={ELEMENT_ICONS[element.type]}
                      size={0.7}
                      className="mr-2"
                    />
                    {t(`admin.tableManagement.floorPlan.elements.${element.type.toLowerCase()}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="w-px h-6 bg-[#404040] mx-1" />

            {/* Canvas Size */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNewCanvasWidth(String(canvasWidth));
                setNewCanvasHeight(String(canvasHeight));
                setIsCanvasSizeDialogOpen(true);
              }}
              className="bg-[#262626] border-[#404040] hover:bg-[#333] text-white"
            >
              <Icon path={mdiResize} size={0.7} className="mr-1.5" />
              {canvasWidth} × {canvasHeight}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {/* Grid Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleGrid}
              className={`border-[#404040] ${
                showGrid
                  ? "bg-pink-600 hover:bg-pink-700 text-white"
                  : "bg-[#262626] hover:bg-[#333] text-white"
              }`}
            >
              <Icon path={mdiGrid} size={0.7} className="mr-1.5" />
              {showGrid ? t("admin.tableManagement.floorPlan.hideGrid") : t("admin.tableManagement.floorPlan.showGrid")}
            </Button>

            {/* Snap Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleSnap}
              className={`border-[#404040] ${
                snapToGrid
                  ? "bg-pink-600 hover:bg-pink-700 text-white"
                  : "bg-[#262626] hover:bg-[#333] text-white"
              }`}
            >
              {t("admin.tableManagement.floorPlan.snapToGrid")}
            </Button>

            <div className="w-px h-6 bg-[#404040] mx-1" />

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-[#262626] rounded-md px-2 py-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onZoomOut}
                disabled={zoom <= MIN_ZOOM}
                className="h-6 w-6 p-0 hover:bg-[#333] text-white"
              >
                <Icon path={mdiMagnifyMinus} size={0.6} />
              </Button>
              <span className="text-xs text-gray-400 min-w-[50px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onZoomIn}
                disabled={zoom >= MAX_ZOOM}
                className="h-6 w-6 p-0 hover:bg-[#333] text-white"
              >
                <Icon path={mdiMagnifyPlus} size={0.6} />
              </Button>
            </div>

            <div className="w-px h-6 bg-[#404040] mx-1" />

            {/* Save & Cancel */}
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="bg-[#262626] border-[#404040] hover:bg-[#333] text-white"
            >
              <Icon path={mdiClose} size={0.7} className="mr-1.5" />
              {t("admin.tableManagement.floorPlan.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={saving || !onSave}
              className="bg-pink-600 hover:bg-pink-700 text-white"
            >
              <Icon path={mdiContentSave} size={0.7} className="mr-1.5" />
              {saving ? t("admin.tableManagement.floorPlan.saving") : t("admin.tableManagement.floorPlan.save")}
            </Button>
          </div>
        </div>
      )}

      {/* Add Table Dialog */}
      <Dialog open={isTableDialogOpen} onOpenChange={setIsTableDialogOpen}>
        <DialogContent className="bg-[#1a1a1a] border-[#333] text-white">
          <DialogHeader>
            <DialogTitle>{t("admin.tableManagement.floorPlan.addTable")}</DialogTitle>
            <DialogDescription className="text-gray-400">
              {t("admin.tableManagement.floorPlan.addTableDescription", "Create a new table for this zone's floor plan.")}
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
                className="bg-[#262626] border-[#404040] text-white"
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
                className="bg-[#262626] border-[#404040] text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shape">{t("admin.tableManagement.floorPlan.shape")}</Label>
              <Select value={newTableShape} onValueChange={(v) => setNewTableShape(v as TableShape)}>
                <SelectTrigger className="bg-[#262626] border-[#404040] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
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
                className="bg-[#262626] border-[#404040] hover:bg-[#333] text-white"
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

      {/* Canvas Size Dialog */}
      <Dialog open={isCanvasSizeDialogOpen} onOpenChange={setIsCanvasSizeDialogOpen}>
        <DialogContent className="bg-[#1a1a1a] border-[#333] text-white">
          <DialogHeader>
            <DialogTitle>{t("admin.tableManagement.floorPlan.canvasSize")}</DialogTitle>
            <DialogDescription className="text-gray-400">
              {t("admin.tableManagement.floorPlan.canvasSizeDescription", "Adjust the size of the floor plan canvas.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="canvasWidth">{t("admin.tableManagement.floorPlan.width")} (px)</Label>
              <Input
                id="canvasWidth"
                type="number"
                max={MAX_CANVAS_SIZE}
                value={newCanvasWidth}
                onChange={(e) => setNewCanvasWidth(e.target.value)}
                className="bg-[#262626] border-[#404040] text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="canvasHeight">{t("admin.tableManagement.floorPlan.height")} (px)</Label>
              <Input
                id="canvasHeight"
                type="number"
                max={MAX_CANVAS_SIZE}
                value={newCanvasHeight}
                onChange={(e) => setNewCanvasHeight(e.target.value)}
                className="bg-[#262626] border-[#404040] text-white"
              />
            </div>
            <p className="text-xs text-gray-500">
              {t("admin.tableManagement.floorPlan.minCanvasSize", { min: MIN_CANVAS_SIZE, max: MAX_CANVAS_SIZE })}
            </p>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsCanvasSizeDialogOpen(false)}
                className="bg-[#262626] border-[#404040] hover:bg-[#333] text-white"
              >
                {t("admin.tableManagement.floorPlan.cancel")}
              </Button>
              <Button
                onClick={handleCanvasSizeChange}
                className="bg-pink-600 hover:bg-pink-700 text-white"
              >
                {t("admin.tableManagement.floorPlan.apply", "Apply")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Label Dialog */}
      <Dialog open={isLabelDialogOpen} onOpenChange={setIsLabelDialogOpen}>
        <DialogContent className="bg-[#1a1a1a] border-[#333] text-white">
          <DialogHeader>
            <DialogTitle>{t("admin.tableManagement.floorPlan.addLabel", "Add Label")}</DialogTitle>
            <DialogDescription className="text-gray-400">
              {t("admin.tableManagement.floorPlan.addLabelDescription", "Add a text label to the floor plan.")}
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
                className="bg-[#262626] border-[#404040] text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsLabelDialogOpen(false)}
                className="bg-[#262626] border-[#404040] hover:bg-[#333] text-white"
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

