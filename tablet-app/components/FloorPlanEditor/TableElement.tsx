import React, { useRef, useCallback } from "react";
import { PanResponder, GestureResponderEvent, PanResponderGestureState } from "react-native";
import Svg, {
  G,
  Rect,
  Circle,
  Text as SvgText,
} from "react-native-svg";
import type { DraggableTable } from "./types";

interface TableElementProps {
  table: DraggableTable;
  isSelected: boolean;
  onSelect: () => void;
  onDrag: (deltaX: number, deltaY: number) => void;
  zoom: number;
}

const TableElement: React.FC<TableElementProps> = ({
  table,
  isSelected,
  onSelect,
  onDrag,
  zoom,
}) => {
  const {
    id,
    tableNumber,
    capacity,
    shape,
    positionX,
    positionY,
    width,
    height,
    rotation,
  } = table;

  const lastPanRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  const handlePanStart = useCallback(
    (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      isDraggingRef.current = false;
      lastPanRef.current = { x: 0, y: 0 };
      onSelect();
    },
    [onSelect]
  );

  const handlePanMove = useCallback(
    (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      isDraggingRef.current = true;
      const deltaX = gestureState.dx - lastPanRef.current.x;
      const deltaY = gestureState.dy - lastPanRef.current.y;
      lastPanRef.current = { x: gestureState.dx, y: gestureState.dy };
      onDrag(deltaX, deltaY);
    },
    [onDrag]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: handlePanStart,
      onPanResponderMove: handlePanMove,
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        lastPanRef.current = { x: 0, y: 0 };
      },
    })
  ).current;

  // Table colors
  const fillColor = isSelected ? "#ec4899" : "#3b82f6";
  const strokeColor = isSelected ? "#f472b6" : "#60a5fa";
  const textColor = "#ffffff";

  // Center point for rotation
  const centerX = positionX + width / 2;
  const centerY = positionY + height / 2;

  // Render shape based on type
  const renderShape = () => {
    if (shape === "ROUND") {
      const radius = Math.min(width, height) / 2;
      return (
        <Circle
          cx={positionX + width / 2}
          cy={positionY + height / 2}
          r={radius}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={isSelected ? 3 : 2}
        />
      );
    }

    return (
      <Rect
        x={positionX}
        y={positionY}
        width={width}
        height={height}
        rx={shape === "SQUARE" ? 4 : 8}
        ry={shape === "SQUARE" ? 4 : 8}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={isSelected ? 3 : 2}
      />
    );
  };

  return (
    <G
      rotation={rotation}
      origin={`${centerX}, ${centerY}`}
      {...panResponder.panHandlers}
    >
      {/* Selection highlight */}
      {isSelected && (
        <Rect
          x={positionX - 4}
          y={positionY - 4}
          width={width + 8}
          height={height + 8}
          rx={shape === "ROUND" ? (width + 8) / 2 : 6}
          ry={shape === "ROUND" ? (height + 8) / 2 : 6}
          fill="transparent"
          stroke="#ec4899"
          strokeWidth={2}
          strokeDasharray="4,4"
        />
      )}

      {/* Table shape */}
      {renderShape()}

      {/* Table number */}
      <SvgText
        x={positionX + width / 2}
        y={positionY + height / 2 - 4}
        fontSize={Math.min(width, height) * 0.25}
        fontWeight="bold"
        fill={textColor}
        textAnchor="middle"
        alignmentBaseline="middle"
      >
        {tableNumber}
      </SvgText>

      {/* Capacity */}
      <SvgText
        x={positionX + width / 2}
        y={positionY + height / 2 + 10}
        fontSize={Math.min(width, height) * 0.18}
        fill={textColor}
        textAnchor="middle"
        alignmentBaseline="middle"
        opacity={0.8}
      >
        {capacity}p
      </SvgText>
    </G>
  );
};

export default TableElement;

