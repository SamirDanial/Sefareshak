import React from "react";
import Icon from "@mdi/react";
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
} from "@mdi/js";
import type { DraggableFloorElement } from "./types";
import type { FloorElementType } from "@/services/reservationService";

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
  FLOOR_AREA: mdiLabel,
};

const ELEMENT_COLORS: Record<FloorElementType, string> = {
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

interface FloorElementComponentProps {
  element: DraggableFloorElement;
  isSelected: boolean;
  zoom: number;
  onMouseDown: (e: React.MouseEvent, id: string, type: "element") => void;
  onTouchStart: (e: React.TouchEvent, id: string, type: "element") => void;
  onSelect: (id: string, type: "element") => void;
}

export const FloorElementComponent: React.FC<FloorElementComponentProps> = ({
  element,
  isSelected,
  zoom,
  onMouseDown,
  onTouchStart,
  onSelect,
}) => {
  const iconPath = ELEMENT_ICONS[element.elementType] || mdiLabel;
  const bgColor = element.color || ELEMENT_COLORS[element.elementType] || "#6b7280";

  if (element.elementType === "FLOOR_AREA") {
    const hasImage = typeof element.icon === "string" && element.icon.length > 0;
    return (
      <div
        data-floor-item
        style={{
          position: "absolute",
          left: element.positionX * zoom,
          top: element.positionY * zoom,
          width: element.width * zoom,
          height: element.height * zoom,
          transform: `rotate(${element.rotation}deg)`,
          transformOrigin: "center center",
          backgroundColor: hasImage ? (element.color || "transparent") : bgColor,
          backgroundImage: hasImage ? `url(${element.icon})` : undefined,
          backgroundRepeat: hasImage ? "repeat" : undefined,
          backgroundSize: hasImage ? `${64 * zoom}px ${64 * zoom}px` : undefined,
          backgroundPosition: hasImage ? "top left" : undefined,
          opacity: hasImage ? 1 : 0.35,
          borderRadius: `${6 * zoom}px`,
          cursor: "move",
          userSelect: "none",
          zIndex: isSelected ? 4 : 1,
          boxShadow: isSelected
            ? "0 0 0 3px rgba(236, 72, 153, 0.5)"
            : "none",
          border: isSelected ? `${2 * zoom}px solid #ec4899` : "none",
          touchAction: "none",
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect(element.id, "element");
          onMouseDown(e, element.id, "element");
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          onSelect(element.id, "element");
          onTouchStart(e, element.id, "element");
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(element.id, "element");
        }}
      />
    );
  }

  if (element.elementType === "WALL") {
    return (
      <div
        data-floor-item
        style={{
          position: "absolute",
          left: element.positionX * zoom,
          top: element.positionY * zoom,
          width: element.width * zoom,
          height: element.height * zoom,
          transform: `rotate(${element.rotation}deg)`,
          transformOrigin: "center center",
          backgroundColor: bgColor,
          borderRadius: `${2 * zoom}px`,
          cursor: "move",
          userSelect: "none",
          zIndex: isSelected ? 99 : 5,
          boxShadow: isSelected
            ? "0 0 0 3px rgba(236, 72, 153, 0.5)"
            : "0 1px 3px rgba(0,0,0,0.2)",
          border: isSelected ? `${2 * zoom}px solid #ec4899` : "none",
          touchAction: "none",
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect(element.id, "element");
          onMouseDown(e, element.id, "element");
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          onSelect(element.id, "element");
          onTouchStart(e, element.id, "element");
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(element.id, "element");
        }}
      />
    );
  }

  if (element.elementType === "LABEL") {
    return (
      <div
        data-floor-item
        style={{
          position: "absolute",
          left: element.positionX * zoom,
          top: element.positionY * zoom,
          width: element.width * zoom,
          height: element.height * zoom,
          transform: `rotate(${element.rotation}deg)`,
          transformOrigin: "center center",
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          borderRadius: `${4 * zoom}px`,
          cursor: "move",
          userSelect: "none",
          zIndex: isSelected ? 99 : 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: `${4 * zoom}px`,
          boxShadow: isSelected
            ? "0 0 0 3px rgba(236, 72, 153, 0.5)"
            : "0 1px 3px rgba(0,0,0,0.2)",
          border: isSelected ? `${2 * zoom}px solid #ec4899` : "none",
          touchAction: "none",
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect(element.id, "element");
          onMouseDown(e, element.id, "element");
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          onSelect(element.id, "element");
          onTouchStart(e, element.id, "element");
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(element.id, "element");
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: `${Math.max(10, 12 * zoom)}px`,
            fontWeight: 500,
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {element.label || "Label"}
        </span>
      </div>
    );
  }

  return (
    <div
      data-floor-item
      style={{
        position: "absolute",
        left: element.positionX * zoom,
        top: element.positionY * zoom,
        width: element.width * zoom,
        height: element.height * zoom,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: "center center",
        backgroundColor: `${bgColor}20`,
        borderRadius: `${6 * zoom}px`,
        border: `${2 * zoom}px dashed ${bgColor}`,
        cursor: "move",
        userSelect: "none",
        zIndex: isSelected ? 99 : 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: `${4 * zoom}px`,
        boxShadow: isSelected
          ? "0 0 0 3px rgba(236, 72, 153, 0.5)"
          : "none",
        touchAction: "none",
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(element.id, "element");
        onMouseDown(e, element.id, "element");
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        onSelect(element.id, "element");
        onTouchStart(e, element.id, "element");
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(element.id, "element");
      }}
    >
      <Icon
        path={iconPath}
        size={Math.max(0.6, 0.8 * zoom)}
        color={bgColor}
      />
      {element.label && (
        <span
          style={{
            color: bgColor,
            fontSize: `${Math.max(8, 10 * zoom)}px`,
            fontWeight: 500,
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
            padding: `0 ${4 * zoom}px`,
          }}
        >
          {element.label}
        </span>
      )}
    </div>
  );
};
