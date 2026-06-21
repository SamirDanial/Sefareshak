import React, { useCallback, useMemo, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
} from "react-native";
import Svg, {
  Rect,
  Line,
  G,
  Circle,
  Text as SvgText,
  Defs,
  Pattern,
  Image as SvgImage,
  Path,
} from "react-native-svg";
import {
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
  mdiBrush,
} from "@mdi/js";
import type {
  DraggableTable,
  DraggableFloorElement,
  SelectedItem,
} from "./types";
import { GRID_SIZE, FLOOR_ELEMENT_COLORS, FLOOR_ELEMENT_TYPES } from "./types";

const ELEMENT_MDI_PATHS: Record<string, string> = {
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

interface EditorCanvasProps {
  width: number;
  height: number;
  zoom: number;
  showGrid: boolean;
  snapToGrid: boolean;
  tables: DraggableTable[];
  floorElements: DraggableFloorElement[];
  selectedItem: SelectedItem;
  paintMode?: boolean;
  onPaintAreaComplete?: (rect: { x: number; y: number; width: number; height: number }) => void;
  onSelectItem: (id: string | null, type: "table" | "element" | null) => void;
  onMoveItem: (
    id: string,
    type: "table" | "element",
    positionX: number,
    positionY: number
  ) => void;
  onZoomChange: (zoom: number) => void;
}

const EditorCanvas: React.FC<EditorCanvasProps> = ({
  width,
  height,
  zoom,
  showGrid,
  snapToGrid,
  tables,
  floorElements,
  selectedItem,
  paintMode = false,
  onPaintAreaComplete,
  onSelectItem,
  onMoveItem,
}) => {
  const scaledWidth = width * zoom;
  const scaledHeight = height * zoom;
  
  // Track dragging state
  const [isDragging, setIsDragging] = useState(false);
  const lastItemTouchTsRef = useRef<number>(0);
  const [paintRect, setPaintRect] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const paintStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    id: string;
    type: "table" | "element";
    startX: number;
    startY: number;
    startTouchX: number;
    startTouchY: number;
  } | null>(null);

  // Snap position to grid
  const snapPosition = useCallback(
    (value: number): number => {
      if (!snapToGrid) return value;
      return Math.round(value / GRID_SIZE) * GRID_SIZE;
    },
    [snapToGrid]
  );

  // Handle canvas tap to deselect
  const handleCanvasTap = useCallback(() => {
    // When tapping an item, the underlying TouchableWithoutFeedback can also receive the tap.
    // Suppress deselect if an item was touched very recently.
    const now = Date.now();
    if (!paintMode && !isDragging && now - lastItemTouchTsRef.current > 250) {
      onSelectItem(null, null);
    }
  }, [paintMode, isDragging, onSelectItem]);

  const normalizePaintRect = useCallback(() => {
    if (!paintRect) return null;
    const x = Math.min(paintRect.x1, paintRect.x2);
    const y = Math.min(paintRect.y1, paintRect.y2);
    const w = Math.abs(paintRect.x2 - paintRect.x1);
    const h = Math.abs(paintRect.y2 - paintRect.y1);
    if (w < 5 || h < 5) return null;
    return { x, y, width: w, height: h };
  }, [paintRect]);

  // Handle item press start
  const handleItemPressIn = useCallback(
    (
      id: string,
      type: "table" | "element",
      positionX: number,
      positionY: number,
      touchX: number,
      touchY: number
    ) => {
      dragRef.current = {
        id,
        type,
        startX: positionX,
        startY: positionY,
        startTouchX: touchX,
        startTouchY: touchY,
      };
      lastItemTouchTsRef.current = Date.now();
      onSelectItem(id, type);
    },
    [onSelectItem]
  );

  // Handle item drag
  const handleItemDrag = useCallback(
    (touchX: number, touchY: number) => {
      if (!dragRef.current) return;

      setIsDragging(true);

      const deltaX = (touchX - dragRef.current.startTouchX) / zoom;
      const deltaY = (touchY - dragRef.current.startTouchY) / zoom;

      let newX = dragRef.current.startX + deltaX;
      let newY = dragRef.current.startY + deltaY;

      // Snap to grid
      newX = snapPosition(newX);
      newY = snapPosition(newY);

      // Constrain to canvas
      newX = Math.max(0, Math.min(width - 40, newX));
      newY = Math.max(0, Math.min(height - 40, newY));

      onMoveItem(dragRef.current.id, dragRef.current.type, newX, newY);
    },
    [zoom, snapPosition, width, height, onMoveItem]
  );

  // Handle drag end
  const handleItemPressOut = useCallback(() => {
    setTimeout(() => {
      setIsDragging(false);
    }, 100);
    dragRef.current = null;
  }, []);

  // Render grid lines
  const gridLines = useMemo(() => {
    if (!showGrid) return null;

    const lines = [];
    for (let x = 0; x <= width; x += GRID_SIZE) {
      lines.push(
        <Line
          key={`v-${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={height}
          stroke="#d1d5db"
          strokeWidth={0.5}
          opacity={0.3}
        />
      );
    }
    for (let y = 0; y <= height; y += GRID_SIZE) {
      lines.push(
        <Line
          key={`h-${y}`}
          x1={0}
          y1={y}
          x2={width}
          y2={y}
          stroke="#d1d5db"
          strokeWidth={0.5}
          opacity={0.3}
        />
      );
    }
    return lines;
  }, [showGrid, width, height]);

  // Render a table
  const renderTable = (table: DraggableTable) => {
    const { id, tableNumber, capacity, shape, positionX, positionY, width: w, height: h, rotation } = table;
    const isSelected = selectedItem?.type === "table" && selectedItem?.id === id;
    const fillColor = isSelected ? "#ec4899" : "#3b82f6";
    const strokeColor = isSelected ? "#f472b6" : "#60a5fa";
    const centerX = positionX + w / 2;
    const centerY = positionY + h / 2;

    return (
      <G key={id} rotation={rotation} origin={`${centerX}, ${centerY}`}>
        {isSelected && (
          <Rect
            x={positionX - 3}
            y={positionY - 3}
            width={w + 6}
            height={h + 6}
            rx={shape === "ROUND" ? (w + 6) / 2 : 4}
            fill="transparent"
            stroke="#ec4899"
            strokeWidth={2}
            strokeDasharray="4,4"
          />
        )}
        {shape === "ROUND" ? (
          <Circle
            cx={centerX}
            cy={centerY}
            r={Math.min(w, h) / 2}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={2}
          />
        ) : (
          <Rect
            x={positionX}
            y={positionY}
            width={w}
            height={h}
            rx={4}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={2}
          />
        )}
        <SvgText
          x={centerX}
          y={centerY - 3}
          fontSize={Math.min(w, h) * 0.22}
          fontWeight="bold"
          fill="#fff"
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {tableNumber}
        </SvgText>
        <SvgText
          x={centerX}
          y={centerY + 10}
          fontSize={Math.min(w, h) * 0.16}
          fill="#fff"
          textAnchor="middle"
          opacity={0.8}
        >
          {capacity}p
        </SvgText>
      </G>
    );
  };

  // Render a floor element
  const renderElement = (element: DraggableFloorElement) => {
    const { id, elementType, label, positionX, positionY, width: w, height: h, rotation, color, icon } = element;
    const isSelected = selectedItem?.type === "element" && selectedItem?.id === id;
    const fillColor = color || FLOOR_ELEMENT_COLORS[elementType] || "#666";
    const strokeColor = isSelected ? "#ec4899" : "#9ca3af";
    const centerX = positionX + w / 2;
    const centerY = positionY + h / 2;

    if (elementType === "FLOOR_AREA") {
      const patternId = `tile_${id}`;
      const hasImage = typeof icon === "string" && icon.length > 0;
      return (
        <G key={id} rotation={rotation} origin={`${centerX}, ${centerY}`}>
          {hasImage && (
            <Defs>
              <Pattern
                id={patternId}
                patternUnits="userSpaceOnUse"
                width={40}
                height={40}
              >
                <SvgImage href={icon as string} x={0} y={0} width={40} height={40} preserveAspectRatio="xMidYMid slice" />
              </Pattern>
            </Defs>
          )}

          <Rect
            x={positionX}
            y={positionY}
            width={w}
            height={h}
            rx={4}
            fill={hasImage ? `url(#${patternId})` : fillColor}
            stroke={isSelected ? "#ec4899" : "transparent"}
            strokeWidth={isSelected ? 2 : 0}
            opacity={hasImage ? 1 : 0.25}
          />

          {isSelected && (
            <Rect
              x={positionX - 3}
              y={positionY - 3}
              width={w + 6}
              height={h + 6}
              rx={4}
              fill="transparent"
              stroke="#ec4899"
              strokeWidth={2}
              strokeDasharray="4,4"
            />
          )}
        </G>
      );
    }

    if (elementType === "WALL") {
      return (
        <G key={id} rotation={rotation} origin={`${centerX}, ${centerY}`}>
          {isSelected && (
            <Rect
              x={positionX - 3}
              y={positionY - 3}
              width={w + 6}
              height={h + 6}
              rx={2}
              fill="transparent"
              stroke="#ec4899"
              strokeWidth={2}
              strokeDasharray="4,4"
            />
          )}
          <Rect
            x={positionX}
            y={positionY}
            width={w}
            height={h}
            rx={2}
            fill={fillColor}
            opacity={0.9}
          />
        </G>
      );
    }

    return (
      <G key={id} rotation={rotation} origin={`${centerX}, ${centerY}`}>
        {isSelected && (
          <Rect
            x={positionX - 3}
            y={positionY - 3}
            width={w + 6}
            height={h + 6}
            rx={4}
            fill="transparent"
            stroke="#ec4899"
            strokeWidth={2}
            strokeDasharray="4,4"
          />
        )}
        <Rect
          x={positionX}
          y={positionY}
          width={w}
          height={h}
          rx={4}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1}
          opacity={0.9}
        />

        {elementType === "LABEL" ? (
          <SvgText
            x={centerX}
            y={centerY}
            fontSize={Math.min(12, w * 0.18, h * 0.45)}
            fontWeight="600"
            fill="#fff"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {label || "Label"}
          </SvgText>
        ) : (
          (() => {
            const d = ELEMENT_MDI_PATHS[elementType] || "";
            const iconSize = Math.min(w, h) * 0.52;
            const scale = iconSize / 24;
            const tx = centerX - 12 * scale;
            const ty = centerY - 12 * scale;
            return (
              <G transform={`translate(${tx} ${ty}) scale(${scale})`}>
                <Path d={d} fill="rgba(0,0,0,0.7)" />
              </G>
            );
          })()
        )}
      </G>
    );
  };

  // Create touch areas for items
  const renderTouchAreas = () => {
    if (paintMode) return null;
    const areas: React.ReactNode[] = [];

    // Floor elements touch areas
    floorElements.forEach((element) => {
      const { id, positionX, positionY, width: w, height: h } = element;
      areas.push(
        <View
          key={`touch-el-${id}`}
          style={[
            styles.touchArea,
            {
              left: positionX * zoom,
              top: positionY * zoom,
              width: w * zoom,
              height: h * zoom,
            },
          ]}
          onTouchStart={(e) => {
            e.stopPropagation();
            lastItemTouchTsRef.current = Date.now();
            handleItemPressIn(id, "element", positionX, positionY, e.nativeEvent.pageX, e.nativeEvent.pageY);
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
            lastItemTouchTsRef.current = Date.now();
            handleItemDrag(e.nativeEvent.pageX, e.nativeEvent.pageY);
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            lastItemTouchTsRef.current = Date.now();
            handleItemPressOut();
          }}
        />
      );
    });

    // Table touch areas (on top)
    tables.forEach((table) => {
      const { id, positionX, positionY, width: w, height: h } = table;
      areas.push(
        <View
          key={`touch-tbl-${id}`}
          style={[
            styles.touchArea,
            {
              left: positionX * zoom,
              top: positionY * zoom,
              width: w * zoom,
              height: h * zoom,
            },
          ]}
          onTouchStart={(e) => {
            e.stopPropagation();
            lastItemTouchTsRef.current = Date.now();
            handleItemPressIn(id, "table", positionX, positionY, e.nativeEvent.pageX, e.nativeEvent.pageY);
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
            lastItemTouchTsRef.current = Date.now();
            handleItemDrag(e.nativeEvent.pageX, e.nativeEvent.pageY);
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            lastItemTouchTsRef.current = Date.now();
            handleItemPressOut();
          }}
        />
      );
    });

    return areas;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!isDragging && !paintMode}
        contentContainerStyle={{ minWidth: scaledWidth }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isDragging && !paintMode}
          contentContainerStyle={{ minHeight: scaledHeight }}
        >
          <TouchableWithoutFeedback onPress={handleCanvasTap}>
            <View
              style={[styles.canvasWrapper, { width: scaledWidth, height: scaledHeight }]}
              onTouchStart={(e) => {
                if (!paintMode) return;
                const x = e.nativeEvent.locationX / zoom;
                const y = e.nativeEvent.locationY / zoom;
                paintStartRef.current = { x, y };
                setPaintRect({ x1: x, y1: y, x2: x, y2: y });
              }}
              onTouchMove={(e) => {
                if (!paintMode) return;
                const start = paintStartRef.current;
                if (!start) return;
                const x = e.nativeEvent.locationX / zoom;
                const y = e.nativeEvent.locationY / zoom;
                setPaintRect({ x1: start.x, y1: start.y, x2: x, y2: y });
              }}
              onTouchEnd={() => {
                if (!paintMode) return;
                const rect = normalizePaintRect();
                paintStartRef.current = null;
                setPaintRect(null);
                if (rect && onPaintAreaComplete) {
                  onPaintAreaComplete(rect);
                }
              }}
            >
              {/* SVG Canvas */}
              <Svg
                width={scaledWidth}
                height={scaledHeight}
                viewBox={`0 0 ${width} ${height}`}
              >
                <Rect x={0} y={0} width={width} height={height} fill="#e5e7eb" />
                {gridLines}
                {floorElements.filter((el) => el.elementType === "FLOOR_AREA").map(renderElement)}
                {floorElements.filter((el) => el.elementType !== "FLOOR_AREA").map(renderElement)}
                {tables.map(renderTable)}

                {paintMode && paintRect && (
                  <Rect
                    x={Math.min(paintRect.x1, paintRect.x2)}
                    y={Math.min(paintRect.y1, paintRect.y2)}
                    width={Math.abs(paintRect.x2 - paintRect.x1)}
                    height={Math.abs(paintRect.y2 - paintRect.y1)}
                    fill="rgba(236, 72, 153, 0.12)"
                    stroke="#ec4899"
                    strokeWidth={2}
                    strokeDasharray="4,4"
                  />
                )}
              </Svg>

              {/* Touch areas overlay */}
              {renderTouchAreas()}
            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  canvasWrapper: {
    backgroundColor: "#f9fafb",
    borderWidth: 0,
    position: "relative",
  },
  touchArea: {
    position: "absolute",
    backgroundColor: "transparent",
  },
});

export default EditorCanvas;
