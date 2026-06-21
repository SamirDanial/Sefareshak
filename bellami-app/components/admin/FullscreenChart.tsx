import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Dimensions,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LineChart } from "react-native-chart-kit";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface FullscreenChartProps {
  visible: boolean;
  onClose: () => void;
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      borderColor?: string;
      backgroundColor?: string | string[];
      tension?: number;
    }>;
  };
  title: string;
}

export function FullscreenChart({
  visible,
  onClose,
  data,
  title,
}: FullscreenChartProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === "ios" ? insets.top : 0;
  const [screenDimensions, setScreenDimensions] = useState(
    Dimensions.get("window")
  );

  useEffect(() => {
    if (visible) {
      // Update dimensions when screen size changes
      const updateDimensions = () => {
        const dims = Dimensions.get("window");
        setScreenDimensions(dims);
      };

      const subscription = Dimensions.addEventListener(
        "change",
        updateDimensions
      );
      updateDimensions(); // Initial update

      return () => {
        subscription?.remove();
      };
    }
  }, [visible]);

  const handleClose = () => {
    onClose();
  };

  // Get current screen dimensions (screen stays in portrait, container rotates)
  const screenWidth = screenDimensions.width;
  const screenHeight = screenDimensions.height;

  const chartConfig = {
    backgroundColor: "#171717",
    backgroundGradientFrom: "#171717",
    backgroundGradientTo: "#262626",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(236, 72, 153, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: "2.25", // Reduced by 1/2 (from 4.5)
      strokeWidth: "0.75", // Reduced by 1/2 (from 1.5)
      stroke: "#ec4899",
    },
    propsForBackgroundLines: {
      strokeDasharray: "",
      stroke: "#404040",
      strokeWidth: 1,
    },
    propsForLabels: {
      fontSize: 9, // Reduced to 3/4 of default (12px -> 9px)
    },
  };

  // Manage x-axis labels when there are too many
  const manageXAxisLabels = (labels: string[]): string[] => {
    // For fullscreen, we can show more labels, but still need to manage if too many
    // If we have more than 25 labels, show every 2nd or 3rd label
    if (labels.length > 25) {
      const step = labels.length > 50 ? 3 : 2; // Show every 3rd if > 50, every 2nd if > 25
      return labels.map((label, index) => {
        // Always show first and last label
        if (index === 0 || index === labels.length - 1) {
          return label;
        }
        // Show label every 'step' ticks
        return index % step === 0 ? label : "";
      });
    }
    return labels;
  };

  const chartData = {
    labels: manageXAxisLabels(data.labels),
    datasets: data.datasets.map((dataset) => ({
      data: dataset.data,
      color: (opacity = 1) =>
        dataset.borderColor || `rgba(236, 72, 153, ${opacity})`,
      strokeWidth: 3, // Slightly thicker for fullscreen
    })),
    legend: data.datasets.map((d) => d.label),
  };

  // On both platforms, we manually rotate the container (not the whole screen on Android)
  // So we always use the same dimension calculations
  // Calculate header and footer heights
  const headerHeight = statusBarHeight + 16 + 16 + 1; // statusBar + paddingTop + paddingVertical + border
  const footerHeight = 16 + 16 + 1; // paddingVertical + border
  const headerContentHeight = 24 + 16; // icon size + padding
  const totalHeaderFooterHeight = headerHeight + headerContentHeight + footerHeight + 40; // extra padding
  
  // Since we're manually rotating the container on both platforms, dimensions are swapped
  const availableHeight = screenWidth - totalHeaderFooterHeight; // After rotation, screenWidth becomes height
  const availableWidth = screenHeight - 80; // After rotation, screenHeight becomes width
  
  const chartWidth = availableWidth;
  const chartHeight = availableHeight;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.modalWrapper}>
        <View 
          style={[
            styles.rotatedContainer,
            {
              width: screenHeight,
              height: screenWidth,
              transform: [{ rotate: "90deg" }],
            }
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerSpacer} />
            <View style={styles.headerCenter}>
              <MaterialCommunityIcons name="chart-bar" size={24} color="#ec4899" />
              <Text style={styles.headerTitle}>{title}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close-circle" size={32} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Chart */}
          <View style={styles.chartContainer}>
            <LineChart
              data={chartData}
              width={chartWidth}
              height={chartHeight}
              chartConfig={chartConfig}
              bezier
              style={styles.chart}
              withVerticalLabels={true}
              withHorizontalLabels={true}
              segments={6} // More segments for larger chart
              withInnerLines={true}
              withOuterLines={false}
              fromZero={false}
              yAxisLabel=""
              yAxisSuffix=""
              xAxisLabel=""
              formatYLabel={(value) => {
                const num = parseFloat(value);
                if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
                return num.toFixed(0);
              }}
            />
          </View>

          {/* Footer with legend */}
          <View style={styles.footer}>
            {data.datasets.map((dataset, index) => (
              <View key={index} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    {
                      backgroundColor:
                        typeof dataset.borderColor === "string"
                          ? dataset.borderColor
                          : "#ec4899",
                    },
                  ]}
                />
                <Text style={styles.legendText}>{dataset.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalWrapper: {
    flex: 1,
    backgroundColor: "#171717",
    justifyContent: "center",
    alignItems: "center",
  },
  rotatedContainer: {
    backgroundColor: "#171717",
    position: "relative",
  },
  container: {
    flex: 1,
    backgroundColor: "#171717",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  headerSpacer: {
    width: 60, // Space on the left to push content right
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
  },
  closeButton: {
    padding: 8,
  },
  chartContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
  },
  chart: {
    borderRadius: 16,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
});
