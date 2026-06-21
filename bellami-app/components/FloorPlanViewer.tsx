import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import Svg, {
  Rect,
  Circle,
  G,
  Text as SvgText,
  Line,
  Path,
  Defs,
  Pattern,
  Image as SvgImage,
} from "react-native-svg";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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
  FloorPlanTable,
  FloorElement,
  FloorElementType,
} from "@/src/services/reservationService";

interface FloorPlanViewerProps {
  canvasWidth: number;
  canvasHeight: number;
  tables: FloorPlanTable[];
  floorElements: FloorElement[];
  selectedTableIds: string[];
  availableTableIds: string[];
  onTableSelect: (tableId: string) => void;
  numberOfGuests?: number;
}

// Floor element icons mapping (MDI SVG paths)
const FLOOR_ELEMENT_ICONS: Record<FloorElementType, string> = {
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

// Floor element colors
const FLOOR_ELEMENT_COLORS: Record<FloorElementType, string> = {
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

// Table status colors
const TABLE_COLORS = {
  available: "#059669", // emerald-600
  reserved: "#dc2626", // red-600
  selected: "#ec4899", // pink-500
  unavailable: "#6b7280", // gray-500
};

export default function FloorPlanViewer({
  canvasWidth,
  canvasHeight,
  tables,
  floorElements,
  selectedTableIds,
  availableTableIds,
  onTableSelect,
  numberOfGuests = 1,
}: FloorPlanViewerProps) {
  const { t } = useTranslation();
  const screenWidth = Dimensions.get("window").width;
  const maxViewerHeight = Dimensions.get("window").height * 0.5;

  const [zoomFactor, setZoomFactor] = useState(1);

  const MIN_ZOOM_FACTOR = 0.6;
  const MAX_ZOOM_FACTOR = 2;

  // Calculate scale to fit the floor plan in the view
  const baseScale = useMemo(() => {
    const padding = 32;
    const availableWidth = screenWidth - padding;
    const scaleX = availableWidth / canvasWidth;
    const scaleY = maxViewerHeight / canvasHeight;
    return Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1
  }, [screenWidth, canvasWidth, canvasHeight, maxViewerHeight]);

  const scale = useMemo(() => {
    return Math.max(0.1, baseScale * zoomFactor);
  }, [baseScale, zoomFactor]);

  const zoomPercent = Math.round(zoomFactor * 100);

  const handleZoomIn = useCallback(() => {
    setZoomFactor((prev) => Math.min(MAX_ZOOM_FACTOR, Number((prev + 0.1).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomFactor((prev) => Math.max(MIN_ZOOM_FACTOR, Number((prev - 0.1).toFixed(2))));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomFactor(1);
  }, []);

  const scaledWidth = canvasWidth * scale;
  const scaledHeight = canvasHeight * scale;

  // Get table status
  const getTableStatus = useCallback(
    (tableId: string) => {
      if (selectedTableIds.includes(tableId)) return "selected";
      if (availableTableIds.includes(tableId)) return "available";
      return "reserved";
    },
    [selectedTableIds, availableTableIds]
  );

  // Get table color based on status
  const getTableColor = useCallback(
    (tableId: string) => {
      const status = getTableStatus(tableId);
      return TABLE_COLORS[status] || TABLE_COLORS.unavailable;
    },
    [getTableStatus]
  );

  // Handle table press
  const handleTablePress = useCallback(
    (tableId: string) => {
      const isAvailable = availableTableIds.includes(tableId);
      const isSelected = selectedTableIds.includes(tableId);
      
      // Only allow selection of available tables or deselection of selected tables
      if (isAvailable || isSelected) {
        onTableSelect(tableId);
      }
    },
    [availableTableIds, selectedTableIds, onTableSelect]
  );

  // Render a table
  const renderTable = useCallback(
    (table: FloorPlanTable) => {
      const {
        id,
        tableNumber,
        capacity,
        positionX = 0,
        positionY = 0,
        width = 60,
        height = 60,
        rotation = 0,
        shape = "SQUARE",
      } = table;

      const color = getTableColor(id);
      const status = getTableStatus(id);
      const isClickable = status === "available" || status === "selected";
      const textColor = "#ffffff";

      const scaledX = positionX * scale;
      const scaledY = positionY * scale;
      const scaledW = width * scale;
      const scaledH = height * scale;
      const centerX = scaledX + scaledW / 2;
      const centerY = scaledY + scaledH / 2;

      return (
        <G
          key={id}
          onPress={() => handleTablePress(id)}
          opacity={isClickable ? 1 : 0.6}
        >
          <G
            rotation={rotation}
            origin={`${centerX}, ${centerY}`}
          >
            {shape === "ROUND" ? (
              <Circle
                cx={centerX}
                cy={centerY}
                r={Math.min(scaledW, scaledH) / 2}
                fill={color}
                stroke={status === "selected" ? "#fff" : "rgba(0,0,0,0.2)"}
                strokeWidth={status === "selected" ? 3 : 1}
              />
            ) : (
              <Rect
                x={scaledX}
                y={scaledY}
                width={scaledW}
                height={scaledH}
                rx={shape === "RECTANGLE" ? 4 * scale : 8 * scale}
                fill={color}
                stroke={status === "selected" ? "#fff" : "rgba(0,0,0,0.2)"}
                strokeWidth={status === "selected" ? 3 : 1}
              />
            )}
          </G>
          {/* Table number */}
          <SvgText
            x={centerX}
            y={centerY - 4 * scale}
            fill={textColor}
            fontSize={12 * scale}
            fontWeight="bold"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {tableNumber}
          </SvgText>
          {/* Capacity */}
          <SvgText
            x={centerX}
            y={centerY + 10 * scale}
            fill={textColor}
            fontSize={9 * scale}
            textAnchor="middle"
            alignmentBaseline="middle"
            opacity={0.9}
          >
            {capacity} {t("reservations.booking.seats") || "seats"}
          </SvgText>
        </G>
      );
    },
    [scale, getTableColor, getTableStatus, handleTablePress, t]
  );

  // Render a floor element
  const renderFloorElement = useCallback(
    (element: FloorElement) => {
      const {
        id,
        type,
        label,
        icon,
        positionX,
        positionY,
        width,
        height,
        rotation,
        color,
      } = element;

      const elementColor = color || FLOOR_ELEMENT_COLORS[type] || "#808080";
      const scaledX = positionX * scale;
      const scaledY = positionY * scale;
      const scaledW = width * scale;
      const scaledH = height * scale;
      const centerX = scaledX + scaledW / 2;
      const centerY = scaledY + scaledH / 2;

      const iconPath = FLOOR_ELEMENT_ICONS[type] || mdiLabel;
      const shouldRenderIcon =
        type !== "WALL" &&
        type !== "FLOOR_AREA" &&
        scaledW > 18 * scale &&
        scaledH > 18 * scale;
      const iconSize = Math.min(scaledW, scaledH) * 0.6;
      const iconScale = iconSize / 24;
      const iconTranslateX = centerX - (24 * iconScale) / 2;
      const iconTranslateY = centerY - (24 * iconScale) / 2;

      const hasFloorAreaImage =
        type === "FLOOR_AREA" && typeof icon === "string" && icon.length > 0;
      const floorAreaPatternId = `floor-area-${id}`;
      const floorAreaTileSize = 64 * scale;

      return (
        <G
          key={id}
          rotation={rotation}
          origin={`${centerX}, ${centerY}`}
        >
          {hasFloorAreaImage && (
            <Defs>
              <Pattern
                id={floorAreaPatternId}
                patternUnits="userSpaceOnUse"
                width={floorAreaTileSize}
                height={floorAreaTileSize}
              >
                <SvgImage
                  href={{ uri: icon }}
                  x={0}
                  y={0}
                  width={floorAreaTileSize}
                  height={floorAreaTileSize}
                  preserveAspectRatio="xMidYMid slice"
                  opacity={1}
                />
              </Pattern>
            </Defs>
          )}
          <Rect
            x={scaledX}
            y={scaledY}
            width={scaledW}
            height={scaledH}
            fill={hasFloorAreaImage ? `url(#${floorAreaPatternId})` : elementColor}
            opacity={
              hasFloorAreaImage
                ? 1
                : type === "FLOOR_AREA"
                  ? 0.35
                  : 0.7
            }
            rx={2 * scale}
          />
          {hasFloorAreaImage && (
            <Rect
              x={scaledX}
              y={scaledY}
              width={scaledW}
              height={scaledH}
              fill={elementColor}
              opacity={0.25}
              rx={2 * scale}
            />
          )}
          {shouldRenderIcon && (
            <Path
              d={iconPath}
              fill="#ffffff"
              opacity={0.9}
              transform={`translate(${iconTranslateX}, ${iconTranslateY}) scale(${iconScale})`}
            />
          )}
          {label && (
            <SvgText
              x={centerX}
              y={centerY}
              fill="#ffffff"
              fontSize={10 * scale}
              fontWeight="500"
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {label}
            </SvgText>
          )}
        </G>
      );
    },
    [scale]
  );

  // Calculate total capacity of selected tables
  const selectedCapacity = useMemo(() => {
    return tables
      .filter((t) => selectedTableIds.includes(t.id))
      .reduce((sum, t) => sum + (t.capacity || 0), 0);
  }, [tables, selectedTableIds]);

  const isCapacityMet = selectedCapacity >= numberOfGuests;

  return (
    <View style={styles.container}>
      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: TABLE_COLORS.available }]} />
          <Text style={styles.legendText}>
            {t("reservations.booking.available") || "Available"}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: TABLE_COLORS.reserved }]} />
          <Text style={styles.legendText}>
            {t("reservations.booking.reserved") || "Reserved"}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: TABLE_COLORS.selected }]} />
          <Text style={styles.legendText}>
            {t("reservations.booking.selected") || "Selected"}
          </Text>
        </View>
      </View>

    {/* Floor Plan Canvas */}
    <View style={styles.viewerWrap}>
      <View style={styles.zoomControls}>
        <TouchableOpacity onPress={handleZoomOut} style={styles.zoomButton}>
          <MaterialCommunityIcons name="magnify-minus" size={18} color="#d1d5db" />
        </TouchableOpacity>
        <View style={styles.zoomPercentPill}>
          <Text style={styles.zoomPercentText}>{zoomPercent}%</Text>
        </View>
        <TouchableOpacity onPress={handleZoomIn} style={styles.zoomButton}>
          <MaterialCommunityIcons name="magnify-plus" size={18} color="#d1d5db" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleZoomReset} style={styles.zoomButton}>
          <MaterialCommunityIcons name="restore" size={18} color="#d1d5db" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={[styles.canvasContainer, { width: scaledWidth, height: scaledHeight }]}>
            <Svg width={scaledWidth} height={scaledHeight}>
              {/* Background */}
              <Rect
                x={0}
                y={0}
                width={scaledWidth}
                height={scaledHeight}
                fill="#1f2937"
              />
              
              {/* Grid lines (optional visual aid) */}
              {Array.from({ length: Math.ceil(canvasWidth / 50) + 1 }).map((_, i) => (
                <Line
                  key={`vline-${i}`}
                  x1={i * 50 * scale}
                  y1={0}
                  x2={i * 50 * scale}
                  y2={scaledHeight}
                  stroke="#333"
                  strokeWidth={0.5}
                />
              ))}
              {Array.from({ length: Math.ceil(canvasHeight / 50) + 1 }).map((_, i) => (
                <Line
                  key={`hline-${i}`}
                  x1={0}
                  y1={i * 50 * scale}
                  x2={scaledWidth}
                  y2={i * 50 * scale}
                  stroke="#333"
                  strokeWidth={0.5}
                />
              ))}

              {/* Render floor elements */}
              {floorElements.map(renderFloorElement)}

              {/* Render tables */}
              {tables.map(renderTable)}
            </Svg>
          </View>
        </ScrollView>
      </ScrollView>
    </View>

    {/* Capacity indicator */}
    <View style={styles.capacityIndicator}>
      <MaterialCommunityIcons
        name="account-group"
        size={18}
        color={isCapacityMet ? "#22c55e" : "#f59e0b"}
      />
      <Text
        style={[
          styles.capacityText,
          { color: isCapacityMet ? "#22c55e" : "#f59e0b" },
        ]}
      >
        {selectedCapacity} / {numberOfGuests} {t("reservations.booking.seats") || "seats"}
        {isCapacityMet && " "}
      </Text>
    </View>

    {/* Tap hint */}
    {availableTableIds.length > 0 && selectedTableIds.length === 0 && (
      <Text style={styles.tapHint}>
        {t("reservations.booking.tapToSelect") || "Tap on a green table to select it"}
      </Text>
    )}
  </View>
);

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  viewerWrap: {
    flex: 1,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  zoomControls: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(17, 24, 39, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  zoomButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  zoomPercentPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  zoomPercentText: {
    color: "#d1d5db",
    fontSize: 12,
    fontWeight: "600",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    color: "#9ca3af",
    fontSize: 12,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  canvasContainer: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    overflow: "hidden",
    margin: 16,
  },
  capacityIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  capacityText: {
    fontSize: 14,
    fontWeight: "600",
  },
  tapHint: {
    textAlign: "center",
    color: "#6b7280",
    fontSize: 12,
    paddingBottom: 12,
  },
});
