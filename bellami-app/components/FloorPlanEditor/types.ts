import type {
  FloorElement,
  FloorElementType,
  FloorPlanTable,
  Table,
} from "@/src/services/reservationService";

export type TableShape = "ROUND" | "SQUARE" | "RECTANGLE";

export interface DraggableItem {
  id: string;
  type: "table" | "element";
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
}

export interface DraggableTable extends DraggableItem {
  type: "table";
  tableNumber: string;
  capacity: number;
  shape: TableShape;
  status: string;
}

export interface DraggableFloorElement extends DraggableItem {
  type: "element";
  elementType: FloorElementType;
  label?: string;
  color?: string;
  icon?: string;
}

export type SelectedItem = DraggableTable | DraggableFloorElement | null;

export interface CanvasState {
  width: number;
  height: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  showGrid: boolean;
  gridSize: number;
  snapToGrid: boolean;
}

export interface FloorPlanEditorProps {
  zoneId: string;
  zoneName: string;
  canvasWidth?: number;
  canvasHeight?: number;
  tables: FloorPlanTable[];
  floorElements: FloorElement[];
  readOnly?: boolean;
  onSave?: (data: {
    canvasSettings: { canvasWidth: number; canvasHeight: number };
    tables: Array<{
      id: string;
      tableNumber: string;
      capacity: number;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
      rotation: number;
      shape: string;
    }>;
    floorElements: FloorElement[];
    deletedTableIds: string[];
    deletedElementIds: string[];
    newElements: Array<Omit<FloorElement, "id" | "createdAt" | "updatedAt" | "zoneId">>;
  }) => Promise<void>;
  onCancel: () => void;
}

export interface FloorElementTypeConfig {
  type: FloorElementType;
  label: string;
  icon: string;
  defaultWidth: number;
  defaultHeight: number;
}

export const FLOOR_ELEMENT_TYPES: FloorElementTypeConfig[] = [
  { type: "WINDOW", label: "Window", icon: "window-closed", defaultWidth: 80, defaultHeight: 20 },
  { type: "DOOR", label: "Door", icon: "door-open", defaultWidth: 40, defaultHeight: 10 },
  { type: "STAIRS", label: "Stairs", icon: "stairs", defaultWidth: 60, defaultHeight: 80 },
  { type: "GARDEN", label: "Garden", icon: "flower", defaultWidth: 100, defaultHeight: 100 },
  { type: "WALL", label: "Wall", icon: "wall", defaultWidth: 100, defaultHeight: 10 },
  { type: "BAR", label: "Bar", icon: "glass-cocktail", defaultWidth: 120, defaultHeight: 40 },
  { type: "KITCHEN", label: "Kitchen", icon: "stove", defaultWidth: 80, defaultHeight: 80 },
  { type: "RESTROOM", label: "Restroom", icon: "toilet", defaultWidth: 60, defaultHeight: 60 },
  { type: "PLANT", label: "Plant", icon: "flower-tulip", defaultWidth: 30, defaultHeight: 30 },
  { type: "PILLAR", label: "Pillar", icon: "pillar", defaultWidth: 30, defaultHeight: 30 },
  { type: "LABEL", label: "Label", icon: "tag-text", defaultWidth: 80, defaultHeight: 30 },
  { type: "FLOOR_AREA", label: "Paint Area", icon: "brush", defaultWidth: 120, defaultHeight: 120 },
];

export const TABLE_SHAPES: { value: TableShape; label: string }[] = [
  { value: "ROUND", label: "Round" },
  { value: "SQUARE", label: "Square" },
  { value: "RECTANGLE", label: "Rectangle" },
];

// Floor element colors
export const FLOOR_ELEMENT_COLORS: Record<FloorElementType, string> = {
  WINDOW: "#87CEEB",
  DOOR: "#8B4513",
  STAIRS: "#808080",
  GARDEN: "#228B22",
  WALL: "#696969",
  BAR: "#4169E1",
  KITCHEN: "#FF6347",
  RESTROOM: "#9370DB",
  PLANT: "#32CD32",
  PILLAR: "#A9A9A9",
  LABEL: "#FFD700",
  FLOOR_AREA: "#f59e0b",
};

export const DEFAULT_TABLE_SIZE = 60;
export const MIN_CANVAS_SIZE = 400;
export const MAX_CANVAS_SIZE = 2000;
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2;
export const GRID_SIZE = 20;

