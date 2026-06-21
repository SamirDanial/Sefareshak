import React from "react";
import Icon from "@mdi/react";
import { mdiAccount } from "@mdi/js";
import type { DraggableTable } from "./types";

interface TableElementProps {
  table: DraggableTable;
  isSelected: boolean;
  zoom: number;
  onMouseDown: (e: React.MouseEvent, id: string, type: "table") => void;
  onTouchStart: (e: React.TouchEvent, id: string, type: "table") => void;
  onSelect: (id: string, type: "table") => void;
}

export const TableElement: React.FC<TableElementProps> = ({
  table,
  isSelected,
  zoom,
  onMouseDown,
  onTouchStart,
  onSelect,
}) => {
  const getTableStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: "absolute",
      left: table.positionX * zoom,
      top: table.positionY * zoom,
      width: table.width * zoom,
      height: table.height * zoom,
      transform: `rotate(${table.rotation}deg)`,
      transformOrigin: "center center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      cursor: "move",
      userSelect: "none",
      transition: "box-shadow 0.2s ease",
      zIndex: isSelected ? 100 : 10,
      touchAction: "none",
    };

    // Shape-specific styling
    if (table.shape === "ROUND") {
      return {
        ...baseStyle,
        borderRadius: "50%",
        backgroundColor: isSelected ? "#ec4899" : "#374151",
        border: `${2 * zoom}px solid ${isSelected ? "#f472b6" : "#4b5563"}`,
        boxShadow: isSelected
          ? "0 0 0 3px rgba(236, 72, 153, 0.3)"
          : "0 2px 4px rgba(0,0,0,0.2)",
      };
    }

    return {
      ...baseStyle,
      borderRadius: table.shape === "SQUARE" ? `${4 * zoom}px` : `${6 * zoom}px`,
      backgroundColor: isSelected ? "#ec4899" : "#374151",
      border: `${2 * zoom}px solid ${isSelected ? "#f472b6" : "#4b5563"}`,
      boxShadow: isSelected
        ? "0 0 0 3px rgba(236, 72, 153, 0.3)"
        : "0 2px 4px rgba(0,0,0,0.2)",
    };
  };

  return (
    <div
      data-floor-item
      style={getTableStyle()}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(table.id, "table");
        onMouseDown(e, table.id, "table");
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        onSelect(table.id, "table");
        onTouchStart(e, table.id, "table");
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(table.id, "table");
      }}
    >
      <span
        style={{
          fontSize: `${Math.max(10, 12 * zoom)}px`,
          fontWeight: 600,
          color: "white",
          lineHeight: 1.2,
        }}
      >
        {table.tableNumber}
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: `${2 * zoom}px`,
          marginTop: `${2 * zoom}px`,
        }}
      >
        <Icon path={mdiAccount} size={0.4 * zoom} color="rgba(255,255,255,0.7)" />
        <span
          style={{
            fontSize: `${Math.max(8, 10 * zoom)}px`,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          {table.capacity}
        </span>
      </div>
    </div>
  );
};

