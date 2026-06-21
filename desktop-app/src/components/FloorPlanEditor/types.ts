import type { FloorElement, FloorElementType, Table } from "../../services/reservationService";

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

export interface FloorPlanEditorProps {
  zoneId: string;
  zoneName: string;
  readOnly?: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  backgroundImage?: string;
  tables: Table[];
  floorElements: FloorElement[];
  onRequestEditMode?: () => void;
  onSave?: (data: {
    canvasSettings: { canvasWidth: number; canvasHeight: number; backgroundImage?: string };
    tables: Array<{
      id: string;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
      rotation: number;
      shape: string;
      tableNumber?: string;
      capacity?: number;
    }>;
    deletedTableIds: string[];
    floorElements: FloorElement[];
    deletedElementIds: string[];
    newElements: Array<Omit<FloorElement, "id" | "createdAt" | "updatedAt" | "zoneId">>;
  }) => Promise<void>;
  onCancel: () => void;
}

export const DEFAULT_TABLE_SIZE = 60;
export const MIN_CANVAS_SIZE = 400;
export const MAX_CANVAS_SIZE = 2000;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
export const GRID_SIZE = 20;

export const TABLE_SHAPES: { value: TableShape; label: string }[] = [
  { value: "ROUND", label: "Round" },
  { value: "SQUARE", label: "Square" },
  { value: "RECTANGLE", label: "Rectangle" },
];

export const FLOOR_ELEMENT_TYPES: {
  type: FloorElementType;
  label: string;
  icon: string;
  defaultWidth: number;
  defaultHeight: number;
}[] = [
  { type: "WINDOW", label: "Window", icon: "mdiWindowClosed", defaultWidth: 80, defaultHeight: 20 },
  { type: "DOOR", label: "Door", icon: "mdiDoorOpen", defaultWidth: 40, defaultHeight: 10 },
  { type: "STAIRS", label: "Stairs", icon: "mdiStairs", defaultWidth: 60, defaultHeight: 80 },
  { type: "GARDEN", label: "Garden", icon: "mdiFlower", defaultWidth: 100, defaultHeight: 100 },
  { type: "WALL", label: "Wall", icon: "mdiWall", defaultWidth: 100, defaultHeight: 10 },
  { type: "BAR", label: "Bar", icon: "mdiGlassCocktail", defaultWidth: 120, defaultHeight: 40 },
  { type: "KITCHEN", label: "Kitchen", icon: "mdiStove", defaultWidth: 80, defaultHeight: 80 },
  { type: "RESTROOM", label: "Restroom", icon: "mdiToilet", defaultWidth: 60, defaultHeight: 60 },
  { type: "PLANT", label: "Plant", icon: "mdiFlowerTulip", defaultWidth: 30, defaultHeight: 30 },
  { type: "PILLAR", label: "Pillar", icon: "mdiPillar", defaultWidth: 30, defaultHeight: 30 },
  { type: "LABEL", label: "Label", icon: "mdiLabel", defaultWidth: 120, defaultHeight: 40 },
  { type: "FLOOR_AREA", label: "Floor area", icon: "mdiBrush", defaultWidth: 140, defaultHeight: 140 },
];
