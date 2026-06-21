import React, { useRef, useCallback, useEffect } from "react";
import type {
  DraggableTable,
  DraggableFloorElement,
  SelectedItem,
} from "./types";
import { GRID_SIZE } from "./types";
import { TableElement } from "./TableElement";
import { FloorElementComponent } from "./FloorElementComponent";

interface CanvasProps {
  width: number;
  height: number;
  zoom: number;
  showGrid: boolean;
  snapToGrid: boolean;
  backgroundSvg?: string;
  readOnly?: boolean;
  paintMode?: boolean;
  onPaintComplete?: (
    rect: { x: number; y: number; width: number; height: number },
    screen: { x: number; y: number }
  ) => void;
  tables: DraggableTable[];
  floorElements: DraggableFloorElement[];
  selectedItem: SelectedItem;
  onSelectItem: (id: string | null, type: "table" | "element" | null) => void;
  onMoveItem: (
    id: string,
    type: "table" | "element",
    positionX: number,
    positionY: number
  ) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  width,
  height,
  zoom,
  showGrid,
  snapToGrid,
  backgroundSvg,
  readOnly = false,
  paintMode = false,
  onPaintComplete,
  tables,
  floorElements,
  selectedItem,
  onSelectItem,
  onMoveItem,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragItemRef = useRef<{ id: string; type: "table" | "element" } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; itemX: number; itemY: number } | null>(null);
  const paintDragRef = useRef<{
    isPainting: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [paintRect, setPaintRect] = React.useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const snapPosition = useCallback(
    (value: number): number => {
      if (!snapToGrid) return value;
      return Math.round(value / GRID_SIZE) * GRID_SIZE;
    },
    [snapToGrid]
  );

  const getRotatedBounds = useCallback(
    (itemWidth: number, itemHeight: number, rotation: number): {
      effectiveWidth: number;
      effectiveHeight: number;
      offsetX: number;
      offsetY: number;
    } => {
      const normalizedRotation = ((rotation % 360) + 360) % 360;

      if (normalizedRotation === 0 || normalizedRotation === 180) {
        return {
          effectiveWidth: itemWidth,
          effectiveHeight: itemHeight,
          offsetX: 0,
          offsetY: 0,
        };
      }

      if (normalizedRotation === 90 || normalizedRotation === 270) {
        const offsetX = (itemWidth - itemHeight) / 2;
        const offsetY = (itemHeight - itemWidth) / 2;
        return {
          effectiveWidth: itemHeight,
          effectiveHeight: itemWidth,
          offsetX,
          offsetY,
        };
      }

      const radians = (normalizedRotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));
      const effectiveWidth = itemWidth * cos + itemHeight * sin;
      const effectiveHeight = itemWidth * sin + itemHeight * cos;
      const offsetX = (itemWidth - effectiveWidth) / 2;
      const offsetY = (itemHeight - effectiveHeight) / 2;

      return { effectiveWidth, effectiveHeight, offsetX, offsetY };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, id: string, type: "table" | "element") => {
      if (readOnly) return;
      e.preventDefault();
      isDraggingRef.current = true;
      dragItemRef.current = { id, type };

      let item: DraggableTable | DraggableFloorElement | undefined;
      if (type === "table") {
        item = tables.find((t) => t.id === id);
      } else {
        item = floorElements.find((el) => el.id === id);
      }

      if (item) {
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          itemX: item.positionX,
          itemY: item.positionY,
        };
      }
    },
    [tables, floorElements, readOnly]
  );

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / zoom;
      const y = (clientY - rect.top) / zoom;
      return { x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) };
    },
    [zoom, width, height]
  );

  const handlePaintMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return;
      if (!paintMode) return;
      if (!onPaintComplete) return;
      if (e.button !== 0) return;

      const target = e.target as Element | null;
      if (target && target.closest("[data-floor-item]")) return;

      e.preventDefault();
      e.stopPropagation();

      const p = getCanvasPoint(e.clientX, e.clientY);
      if (!p) return;

      paintDragRef.current = {
        isPainting: true,
        startX: p.x,
        startY: p.y,
        currentX: p.x,
        currentY: p.y,
      };

      setPaintRect({ x: p.x, y: p.y, width: 0, height: 0 });
      onSelectItem(null, null);
    },
    [paintMode, onPaintComplete, getCanvasPoint, onSelectItem, readOnly]
  );

  const handlePaintMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!paintMode) return;
      const s = paintDragRef.current;
      if (!s?.isPainting) return;
      const p = getCanvasPoint(e.clientX, e.clientY);
      if (!p) return;
      s.currentX = p.x;
      s.currentY = p.y;

      const x = Math.min(s.startX, s.currentX);
      const y = Math.min(s.startY, s.currentY);
      const w = Math.abs(s.currentX - s.startX);
      const h = Math.abs(s.currentY - s.startY);
      setPaintRect({ x, y, width: w, height: h });
    },
    [paintMode, getCanvasPoint]
  );

  const handlePaintMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!paintMode) return;
      if (!onPaintComplete) return;
      const s = paintDragRef.current;
      if (!s?.isPainting) return;

      s.isPainting = false;

      const x = Math.min(s.startX, s.currentX);
      const y = Math.min(s.startY, s.currentY);
      const w = Math.abs(s.currentX - s.startX);
      const h = Math.abs(s.currentY - s.startY);

      paintDragRef.current = null;
      setPaintRect(null);

      if (w < 8 || h < 8) return;

      onPaintComplete(
        {
          x: snapPosition(x),
          y: snapPosition(y),
          width: snapPosition(w),
          height: snapPosition(h),
        },
        { x: e.clientX, y: e.clientY }
      );
    },
    [paintMode, onPaintComplete, snapPosition]
  );

  useEffect(() => {
    window.addEventListener("mousemove", handlePaintMouseMove);
    window.addEventListener("mouseup", handlePaintMouseUp);

    return () => {
      window.removeEventListener("mousemove", handlePaintMouseMove);
      window.removeEventListener("mouseup", handlePaintMouseUp);
    };
  }, [handlePaintMouseMove, handlePaintMouseUp]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, id: string, type: "table" | "element") => {
      if (readOnly) return;
      const touch = e.touches[0];
      if (!touch) return;
      isDraggingRef.current = true;
      dragItemRef.current = { id, type };

      let item: DraggableTable | DraggableFloorElement | undefined;
      if (type === "table") {
        item = tables.find((t) => t.id === id);
      } else {
        item = floorElements.find((el) => el.id === id);
      }

      if (item) {
        dragStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          itemX: item.positionX,
          itemY: item.positionY,
        };
      }
    },
    [tables, floorElements, readOnly]
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDraggingRef.current || !dragItemRef.current || !dragStartRef.current) return;

      const { id, type } = dragItemRef.current;
      const start = dragStartRef.current;
      const dx = (clientX - start.x) / zoom;
      const dy = (clientY - start.y) / zoom;

      let newX = snapPosition(start.itemX + dx);
      let newY = snapPosition(start.itemY + dy);

      let item: DraggableTable | DraggableFloorElement | undefined;
      if (type === "table") {
        item = tables.find((t) => t.id === id);
      } else {
        item = floorElements.find((el) => el.id === id);
      }

      if (item) {
        const { effectiveWidth, effectiveHeight, offsetX, offsetY } = getRotatedBounds(
          item.width,
          item.height,
          item.rotation
        );

        newX = Math.max(-offsetX, Math.min(width - effectiveWidth - offsetX, newX));
        newY = Math.max(-offsetY, Math.min(height - effectiveHeight - offsetY, newY));
      }

      onMoveItem(id, type, newX, newY);
    },
    [getRotatedBounds, floorElements, onMoveItem, snapPosition, tables, width, height, zoom]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    },
    [handleMove]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      handleMove(touch.clientX, touch.clientY);
    },
    [handleMove]
  );

  const handleEndDrag = useCallback(() => {
    isDraggingRef.current = false;
    dragItemRef.current = null;
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleEndDrag);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleEndDrag);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleEndDrag);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleEndDrag);
    };
  }, [handleMouseMove, handleTouchMove, handleEndDrag]);

  const renderBackground = () => {
    if (!backgroundSvg) return null;
    return (
      <div
        ref={svgWrapperRef}
        className="absolute inset-0 pointer-events-none overflow-hidden"
        dangerouslySetInnerHTML={{ __html: backgroundSvg }}
      />
    );
  };

  return (
    <div
      ref={canvasRef}
      className="w-full h-full overflow-auto bg-gray-50 relative"
      style={{ backgroundColor: "#f9fafb" }}
    >
      <div
        className="relative bg-white border border-gray-200 shadow-sm"
        style={{ width: width * zoom, height: height * zoom }}
        onClick={() => onSelectItem(null, null)}
        onMouseDown={handlePaintMouseDown}
      >
        {renderBackground()}

        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundSize: `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`,
              backgroundImage:
                "linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)",
            }}
          />
        )}

        {paintRect && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: paintRect.x * zoom,
              top: paintRect.y * zoom,
              width: paintRect.width * zoom,
              height: paintRect.height * zoom,
              border: `${2 * zoom}px dashed rgba(236, 72, 153, 0.9)`,
              background: "rgba(236, 72, 153, 0.15)",
            }}
          />
        )}

        {tables.map((table) => (
          <TableElement
            key={table.id}
            table={table}
            isSelected={selectedItem?.id === table.id && selectedItem?.type === "table"}
            zoom={zoom}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onSelect={onSelectItem as (id: string, type: "table") => void}
          />
        ))}

        {floorElements.map((el) => (
          <FloorElementComponent
            key={el.id}
            element={el}
            isSelected={selectedItem?.id === el.id && selectedItem?.type === "element"}
            zoom={zoom}
            onMouseDown={handleMouseDown as (e: React.MouseEvent, id: string, type: "element") => void}
            onTouchStart={handleTouchStart as (e: React.TouchEvent, id: string, type: "element") => void}
            onSelect={onSelectItem as (id: string, type: "element") => void}
          />
        ))}
      </div>
    </div>
  );
};
