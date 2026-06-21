import React, { useState, useRef, useCallback, useEffect } from "react";
import Icon from "@mdi/react";
import {
  mdiAccount,
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
  mdiMagnifyPlus,
  mdiMagnifyMinus,
  mdiRestore,
  mdiBrush,
} from "@mdi/js";
import type { FloorElement, FloorElementType, Table } from "@/services/reservationService";
import { Button } from "@/components/ui/button";

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

interface FloorPlanViewerProps {
  canvasWidth: number;
  canvasHeight: number;
  tables: Table[];
  floorElements: FloorElement[];
  selectedTableIds: string[];
  availableTableIds: string[];
  onTableSelect: (tableId: string) => void;
  enableTouchScroll?: boolean;
  className?: string;
}

export const FloorPlanViewer: React.FC<FloorPlanViewerProps> = ({
  canvasWidth,
  canvasHeight,
  tables,
  floorElements,
  selectedTableIds,
  availableTableIds,
  onTableSelect,
  enableTouchScroll = false,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [scrollMode, setScrollMode] = useState(false);

  useEffect(() => {
    if (!enableTouchScroll) {
      setScrollMode(false);
      return;
    }
    if (typeof window === "undefined" || !window.matchMedia) {
      setScrollMode(false);
      return;
    }
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const update = () => setScrollMode(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.("change", update);
    return () => mediaQuery.removeEventListener?.("change", update);
  }, [enableTouchScroll]);

  // Calculate initial zoom to fit canvas in container
  useEffect(() => {
    if (containerRef.current) {
      if (scrollMode) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        return;
      }
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const scaleX = (containerWidth - 32) / canvasWidth;
      const scaleY = (containerHeight - 32) / canvasHeight;
      const initialZoom = Math.min(scaleX, scaleY, 1);
      setZoom(initialZoom);
    }
  }, [canvasWidth, canvasHeight, scrollMode]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(2, prev + 0.1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(0.3, prev - 0.1));
  }, []);

  const handleReset = useCallback(() => {
    if (containerRef.current) {
      if (scrollMode) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        return;
      }
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const scaleX = (containerWidth - 32) / canvasWidth;
      const scaleY = (containerHeight - 32) / canvasHeight;
      setZoom(Math.min(scaleX, scaleY, 1));
      setPan({ x: 0, y: 0 });
    }
  }, [canvasWidth, canvasHeight, scrollMode]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    },
    [isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom((prev) => Math.max(0.3, Math.min(2, prev + delta)));
  }, []);

  const getTableStatus = (table: Table): "available" | "selected" | "unavailable" => {
    if (selectedTableIds.includes(table.id)) return "selected";
    if (availableTableIds.includes(table.id)) return "available";
    return "unavailable";
  };

  const getTableStyle = (table: Table): React.CSSProperties => {
    const status = getTableStatus(table);
    const isRound = table.shape === "ROUND";
    
    let bgColor = "#374151"; // Default gray
    let borderColor = "#4b5563";
    let cursor = "not-allowed";
    let opacity = 0.5;

    if (status === "selected") {
      bgColor = "#ec4899"; // Pink
      borderColor = "#f472b6";
      cursor = "pointer";
      opacity = 1;
    } else if (status === "available") {
      bgColor = "#059669"; // Emerald-600 - darker green for better contrast
      borderColor = "#34d399";
      cursor = "pointer";
      opacity = 1;
    }

    return {
      position: "absolute",
      left: (table.positionX ?? 0) * zoom,
      top: (table.positionY ?? 0) * zoom,
      width: (table.width ?? 60) * zoom,
      height: (table.height ?? 60) * zoom,
      transform: `rotate(${table.rotation ?? 0}deg)`,
      transformOrigin: "center center",
      backgroundColor: bgColor,
      border: `${2 * zoom}px solid ${borderColor}`,
      borderRadius: isRound ? "50%" : `${4 * zoom}px`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      cursor,
      opacity,
      transition: "background-color 0.2s, border-color 0.2s, transform 0.2s",
      zIndex: status === "selected" ? 20 : 10,
      boxShadow: status === "selected" ? "0 0 0 3px rgba(236, 72, 153, 0.4)" : "0 2px 4px rgba(0,0,0,0.2)",
    };
  };

  const handleTableClick = (table: Table) => {
    const status = getTableStatus(table);
    if (status === "available" || status === "selected") {
      onTableSelect(table.id);
    }
  };

  const renderFloorElement = (element: FloorElement) => {
    const iconPath = ELEMENT_ICONS[element.type as FloorElementType] || mdiLabel;
    const bgColor = element.color || ELEMENT_COLORS[element.type as FloorElementType] || "#6b7280";

    if (element.type === "FLOOR_AREA") {
      const hasImage = typeof element.icon === "string" && element.icon.length > 0;
      return (
        <div
          key={element.id}
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
            zIndex: 1,
            pointerEvents: "none",
          }}
        />
      );
    }

    // Special rendering for walls
    if (element.type === "WALL") {
      return (
        <div
          key={element.id}
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
            zIndex: 5,
            pointerEvents: "none",
          }}
        />
      );
    }

    // Special rendering for labels
    if (element.type === "LABEL") {
      return (
        <div
          key={element.id}
          style={{
            position: "absolute",
            left: element.positionX * zoom,
            top: element.positionY * zoom,
            width: element.width * zoom,
            height: element.height * zoom,
            transform: `rotate(${element.rotation}deg)`,
            transformOrigin: "center center",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            borderRadius: `${4 * zoom}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: `${4 * zoom}px`,
            zIndex: 5,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              color: "white",
              fontSize: `${Math.max(8, 10 * zoom)}px`,
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            {element.label || ""}
          </span>
        </div>
      );
    }

    // Standard rendering for other elements
    return (
      <div
        key={element.id}
        style={{
          position: "absolute",
          left: element.positionX * zoom,
          top: element.positionY * zoom,
          width: element.width * zoom,
          height: element.height * zoom,
          transform: `rotate(${element.rotation}deg)`,
          transformOrigin: "center center",
          backgroundColor: `${bgColor}15`,
          borderRadius: `${6 * zoom}px`,
          border: `${1.5 * zoom}px dashed ${bgColor}50`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: `${2 * zoom}px`,
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        <Icon
          path={iconPath}
          size={Math.max(0.5, 0.7 * zoom)}
          color={`${bgColor}80`}
        />
        {element.label && (
          <span
            style={{
              color: `${bgColor}80`,
              fontSize: `${Math.max(6, 8 * zoom)}px`,
              fontWeight: 500,
            }}
          >
            {element.label}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a1a] border-b border-[#333]">
        <div className="text-xs text-gray-400">
          <span className="inline-flex items-center gap-1.5 mr-4">
            <span className="w-3 h-3 rounded-full bg-emerald-600" />
            Available
          </span>
          <span className="inline-flex items-center gap-1.5 mr-4">
            <span className="w-3 h-3 rounded-full bg-pink-500" />
            Selected
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-gray-500 opacity-50" />
            Reserved
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            className="h-7 w-7 p-0 text-gray-400 hover:text-white hover:bg-[#333]"
          >
            <Icon path={mdiMagnifyMinus} size={0.6} />
          </Button>
          <span className="text-xs text-gray-400 min-w-[45px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            className="h-7 w-7 p-0 text-gray-400 hover:text-white hover:bg-[#333]"
          >
            <Icon path={mdiMagnifyPlus} size={0.6} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 w-7 p-0 text-gray-400 hover:text-white hover:bg-[#333] ml-1"
          >
            <Icon path={mdiRestore} size={0.6} />
          </Button>
        </div>
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        className={`flex-1 ${scrollMode ? "overflow-auto" : "overflow-hidden"} bg-[#0d0d0d] ${scrollMode ? "" : "cursor-grab active:cursor-grabbing"}`}
        onMouseDown={scrollMode ? undefined : handleMouseDown}
        onMouseMove={scrollMode ? undefined : handleMouseMove}
        onMouseUp={scrollMode ? undefined : handleMouseUp}
        onMouseLeave={scrollMode ? undefined : handleMouseUp}
        onWheel={scrollMode ? undefined : handleWheel}
      >
        <div
          style={{
            transform: scrollMode ? undefined : `translate(${pan.x}px, ${pan.y}px)`,
            display: scrollMode ? "block" : "flex",
            alignItems: scrollMode ? undefined : "center",
            justifyContent: scrollMode ? undefined : "center",
            minHeight: scrollMode ? undefined : "100%",
            padding: "16px",
          }}
        >
          <div
            style={{
              width: canvasWidth * zoom,
              height: canvasHeight * zoom,
              backgroundColor: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: "8px",
              position: "relative",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            {/* Floor Elements */}
            {floorElements.map(renderFloorElement)}

            {/* Tables */}
            {tables.map((table) => {
              const status = getTableStatus(table);
              return (
                <div
                  key={table.id}
                  style={getTableStyle(table)}
                  onClick={() => handleTableClick(table)}
                  title={
                    status === "unavailable"
                      ? "This table is not available"
                      : `Table ${table.tableNumber} - ${table.capacity} seats`
                  }
                >
                  <span
                    style={{
                      fontSize: `${Math.max(8, 10 * zoom)}px`,
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
                      marginTop: `${1 * zoom}px`,
                    }}
                  >
                    <Icon
                      path={mdiAccount}
                      size={0.35 * zoom}
                      color="rgba(255,255,255,0.8)"
                    />
                    <span
                      style={{
                        fontSize: `${Math.max(7, 9 * zoom)}px`,
                        color: "rgba(255,255,255,0.8)",
                      }}
                    >
                      {table.capacity}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FloorPlanViewer;

