import React, { useRef, useCallback } from "react";
import { PanResponder, GestureResponderEvent, PanResponderGestureState } from "react-native";
import {
  G,
  Rect,
  Text as SvgText,
  Path,
} from "react-native-svg";
import type { DraggableFloorElement } from "./types";
import { FLOOR_ELEMENT_COLORS } from "./types";

interface FloorElementComponentProps {
  element: DraggableFloorElement;
  isSelected: boolean;
  onSelect: () => void;
  onDrag: (deltaX: number, deltaY: number) => void;
  zoom: number;
}

// Simple SVG paths for icons
const ELEMENT_PATHS: Record<string, string> = {
  WINDOW: "M3,3H21V21H3V3M5,5V19H19V5H5M7,7H11V11H7V7M13,7H17V11H13V7M7,13H11V17H7V13M13,13H17V17H13V13Z",
  DOOR: "M12,3L2,12H5V20H19V12H22L12,3M12,8.75A2.25,2.25 0 0,1 14.25,11A2.25,2.25 0 0,1 12,13.25A2.25,2.25 0 0,1 9.75,11A2.25,2.25 0 0,1 12,8.75Z",
  STAIRS: "M15,5V11H21V5H15M9,11V17H15V11H9M3,17V23H9V17H3Z",
  GARDEN: "M12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22M12,7C10.21,7 8.5,7.55 7,8.5V10C7.36,9.89 7.73,9.77 8.12,9.65C9.3,9.3 10.6,9 12,9C13.4,9 14.7,9.3 15.88,9.65C16.27,9.77 16.64,9.89 17,10V8.5C15.5,7.55 13.79,7 12,7Z",
  WALL: "M3,16H12V21H3V16M2,10H8V15H2V10M9,10H15V15H9V10M16,10H22V15H16V10M13,16H22V21H13V16M2,4H22V9H2V4Z",
  BAR: "M7.5,7L5.5,5H18.5L16.5,7M11,13V19H6V21H18V19H13V13L21,5V3H3V5L11,13Z",
  KITCHEN: "M6,14V22H18V14H6M8,2H6V4H8V5H6V7H8V8H6V14H8V16H16V14H18V8H16V7H18V5H16V4H18V2H16V4H14V2H12V4H10V2H8V4M8,5H16V8H8V5Z",
  RESTROOM: "M5.5,22V14.5H4V11A2,2 0 0,1 6,9H10A2,2 0 0,1 12,11V14.5H10.5V22H5.5M8,8A2.5,2.5 0 0,1 5.5,5.5A2.5,2.5 0 0,1 8,3A2.5,2.5 0 0,1 10.5,5.5A2.5,2.5 0 0,1 8,8M14.5,22V15.5H14A1,1 0 0,1 13,14.5V10A1,1 0 0,1 14,9H20A1,1 0 0,1 21,10V14.5A1,1 0 0,1 20,15.5H19.5V22H14.5M17,8A2.5,2.5 0 0,1 14.5,5.5A2.5,2.5 0 0,1 17,3A2.5,2.5 0 0,1 19.5,5.5A2.5,2.5 0 0,1 17,8Z",
  PLANT: "M12,3L4,9V21H20V9L12,3M12,8.75C13.24,8.75 14.25,9.76 14.25,11C14.25,12.24 13.24,13.25 12,13.25C10.76,13.25 9.75,12.24 9.75,11C9.75,9.76 10.76,8.75 12,8.75Z",
  PILLAR: "M6,2V4H8V2H16V4H18V2H20V4H22V6H20V18H22V20H20V22H18V20H16V22H8V20H6V22H4V20H2V18H4V6H2V4H4V2H6Z",
  LABEL: "M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5A2,2 0 0,0 17,3Z",
};

const FloorElementComponent: React.FC<FloorElementComponentProps> = ({
  element,
  isSelected,
  onSelect,
  onDrag,
  zoom,
}) => {
  const {
    id,
    elementType,
    label,
    positionX,
    positionY,
    width,
    height,
    rotation,
    color,
  } = element;

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

  const fillColor = color || FLOOR_ELEMENT_COLORS[elementType] || "#666";
  const strokeColor = isSelected ? "#ec4899" : "#333";

  // Center point for rotation
  const centerX = positionX + width / 2;
  const centerY = positionY + height / 2;

  // For LABEL type, show text instead of icon
  if (elementType === "LABEL") {
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
            rx={4}
            ry={4}
            fill="transparent"
            stroke="#ec4899"
            strokeWidth={2}
            strokeDasharray="4,4"
          />
        )}

        {/* Background */}
        <Rect
          x={positionX}
          y={positionY}
          width={width}
          height={height}
          rx={4}
          ry={4}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={isSelected ? 2 : 1}
          opacity={0.9}
        />

        {/* Label text */}
        <SvgText
          x={positionX + width / 2}
          y={positionY + height / 2}
          fontSize={Math.min(width * 0.15, height * 0.5, 14)}
          fontWeight="bold"
          fill="#000"
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {label || "Label"}
        </SvgText>
      </G>
    );
  }

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
          rx={4}
          ry={4}
          fill="transparent"
          stroke="#ec4899"
          strokeWidth={2}
          strokeDasharray="4,4"
        />
      )}

      {/* Element background */}
      <Rect
        x={positionX}
        y={positionY}
        width={width}
        height={height}
        rx={4}
        ry={4}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={isSelected ? 2 : 1}
        opacity={0.85}
      />

      {/* Icon (scaled and centered) */}
      <G
        transform={`translate(${positionX + width * 0.2}, ${positionY + height * 0.2}) scale(${Math.min(width, height) * 0.025})`}
      >
        <Path
          d={ELEMENT_PATHS[elementType] || ELEMENT_PATHS.LABEL}
          fill="#fff"
          opacity={0.9}
        />
      </G>

      {/* Element type label (small) */}
      <SvgText
        x={positionX + width / 2}
        y={positionY + height - 6}
        fontSize={Math.min(8, width * 0.1)}
        fill="#fff"
        textAnchor="middle"
        opacity={0.7}
      >
        {elementType.charAt(0) + elementType.slice(1).toLowerCase()}
      </SvgText>
    </G>
  );
};

export default FloorElementComponent;

