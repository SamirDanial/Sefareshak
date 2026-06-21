import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { LineChart, PieChart, BarChart } from "react-native-chart-kit";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Rect, Text as SvgText } from "react-native-svg";

export type ChartType = "line" | "bar" | "doughnut";

interface ChartProps {
  type: ChartType;
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
  title?: string;
  height?: number;
  onFullscreen?: () => void;
  showFullscreenButton?: boolean;
}

const screenWidth = Dimensions.get("window").width;

export function Chart({
  type,
  data,
  title,
  height = 300,
  onFullscreen,
  showFullscreenButton = false,
}: ChartProps) {
  const [containerWidth, setContainerWidth] = useState(screenWidth - 40);

  // Base chart config for all chart types
  const baseChartConfig = {
    backgroundColor: "#171717",
    backgroundGradientFrom: "#171717",
    backgroundGradientTo: "#262626",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(236, 72, 153, ${opacity})`, // Pink
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForBackgroundLines: {
      strokeDasharray: "", // solid lines
      stroke: "#404040",
      strokeWidth: 1,
    },
  };

  // Chart config for line charts (with reduced dot and label sizes)
  const lineChartConfig = {
    ...baseChartConfig,
    propsForDots: {
      r: "2.25", // Reduced by 1/2 (from 4.5)
      strokeWidth: "0.75", // Reduced by 1/2 (from 1.5)
      stroke: "#ec4899",
    },
    propsForLabels: {
      fontSize: 9, // Reduced to 3/4 of default (12px -> 9px)
    },
  };

  // Chart config for doughnut/pie charts (original dot size)
  const doughnutChartConfig = {
    ...baseChartConfig,
    propsForDots: {
      r: "4.5",
      strokeWidth: "1.5",
      stroke: "#ec4899",
    },
  };

  if (type === "doughnut") {
    // For doughnut charts, use pie chart representation
    const pieData = data.labels.map((label, index) => {
      const dataset = data.datasets[0];
      const value = dataset.data[index];
      const color =
        typeof dataset.backgroundColor === "string"
          ? dataset.backgroundColor
          : Array.isArray(dataset.backgroundColor)
          ? dataset.backgroundColor[index] || "#ec4899"
          : "#ec4899";

      return {
        name: "", // Empty name to hide right-side legend
        population: value,
        color: color,
        legendFontColor: "transparent",
        legendFontSize: 0,
      };
    });

    // Calculate chart height (reserve space for legend below)
    const chartHeight = height - 120; // Reserve 120px for legend below

    return (
      <View style={[styles.container, { height }]}>
        {title && <Text style={styles.title}>{title}</Text>}
        {/* Wrap chart to clip any remaining legend elements */}
        <View style={styles.pieChartWrapper}>
          <PieChart
            data={pieData}
            width={screenWidth - 64}
            height={chartHeight}
            chartConfig={doughnutChartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute
          />
        </View>
        {/* Custom Legend Below Chart */}
        <View style={styles.legendContainer}>
          {data.labels.map((label, index) => (
            <View key={index} style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: pieData[index].color },
                ]}
              />
              <Text style={styles.legendLabel}>{label}</Text>
              <Text style={styles.legendValue}>
                {pieData[index].population}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (type === "bar") {
    // For bar charts, calculate max value for proper y-axis scaling
    const allValues = data.datasets.flatMap((d) => d.data);
    const maxValue = Math.max(...allValues, 1);

    // Calculate nice rounded max for y-axis (round up to next nice number)
    let niceMax = maxValue;
    if (maxValue > 0) {
      const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
      const normalized = maxValue / magnitude;
      let rounded;
      if (normalized <= 1) rounded = 1;
      else if (normalized <= 2) rounded = 2;
      else if (normalized <= 5) rounded = 5;
      else rounded = 10;
      niceMax = rounded * magnitude;
    }

    // Use 5 segments for better granularity
    const segments = 5;

    // Extract colors for each dataset
    const getColor = (dataset: any): string => {
      if (dataset.backgroundColor) {
        if (typeof dataset.backgroundColor === "string") {
          return dataset.backgroundColor;
        }
      }
      if (dataset.borderColor) {
        return dataset.borderColor;
      }
      return "rgba(236, 72, 153, 0.8)";
    };

    // Clean and prepare data
    const cleanedDatasets = data.datasets.map((dataset) => ({
      label: dataset.label,
      data: dataset.data.map((val: any) => {
        const num = Number(val);
        return isNaN(num) || num < 0 ? 0 : num;
      }),
      color: getColor(dataset),
    }));

    // Calculate chart dimensions
    const chartHeight = height - 120; // Reserve space for legend and labels
    const chartWidth = containerWidth || screenWidth - 40;
    const paddingLeft = 50;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 50;
    const graphWidth = chartWidth - paddingLeft - paddingRight;
    const graphHeight = chartHeight - paddingTop - paddingBottom;

    const numBars = data.labels.length;
    const numDatasets = cleanedDatasets.length;
    const barGroupWidth = graphWidth / Math.max(numBars, 1);
    const barWidth =
      numDatasets > 0
        ? (barGroupWidth * 0.6) / numDatasets
        : barGroupWidth * 0.6;
    const barSpacing = barGroupWidth * 0.2; // Spacing between groups
    const barGap =
      numDatasets > 1 ? (barGroupWidth * 0.2) / (numDatasets - 1) : 0;

    return (
      <View style={[styles.container, { height }]}>
        {title && <Text style={styles.title}>{title}</Text>}
        <View
          style={styles.chartWrapper}
          onLayout={(event) => {
            const { width } = event.nativeEvent.layout;
            setContainerWidth(width);
          }}
        >
          <View style={{ width: chartWidth, height: chartHeight }}>
            <Svg width={chartWidth} height={chartHeight}>
              {/* Y-axis grid lines */}
              {Array.from({ length: segments + 1 }).map((_, i) => {
                const y = paddingTop + (graphHeight / segments) * i;
                const value = niceMax - (niceMax / segments) * i;
                return (
                  <React.Fragment key={`grid-${i}`}>
                    <Rect
                      x={paddingLeft}
                      y={y}
                      width={graphWidth}
                      height={1}
                      fill="rgba(156, 163, 175, 0.1)"
                    />
                    <SvgText
                      x={paddingLeft - 5}
                      y={y + 4}
                      fontSize="11"
                      fill="#9CA3AF"
                      textAnchor="end"
                    >
                      {value >= 1000000
                        ? `${(value / 1000000).toFixed(1)}M`
                        : value >= 1000
                        ? `${(value / 1000).toFixed(1)}k`
                        : Math.round(value).toString()}
                    </SvgText>
                  </React.Fragment>
                );
              })}

              {/* Bars - grouped side by side */}
              {data.labels.map((label, labelIndex) => {
                return cleanedDatasets.map((dataset, datasetIndex) => {
                  const value = dataset.data[labelIndex] || 0;
                  const barHeight =
                    value > 0 ? (value / niceMax) * graphHeight : 0;
                  const x =
                    paddingLeft +
                    labelIndex * barGroupWidth +
                    barSpacing / 2 +
                    datasetIndex * (barWidth + barGap);
                  const y = paddingTop + graphHeight - barHeight;

                  return (
                    <Rect
                      key={`bar-${labelIndex}-${datasetIndex}`}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      fill={dataset.color}
                      rx={3}
                    />
                  );
                });
              })}

              {/* X-axis labels */}
              {data.labels.map((label, index) => {
                const x =
                  paddingLeft + index * barGroupWidth + barGroupWidth / 2;
                return (
                  <SvgText
                    key={`label-${index}`}
                    x={x}
                    y={chartHeight - 15}
                    fontSize="10"
                    fill="#9CA3AF"
                    textAnchor="middle"
                  >
                    {label.length > 10 ? label.substring(0, 10) + "..." : label}
                  </SvgText>
                );
              })}
            </Svg>
          </View>
        </View>
        {/* Custom Legend Below Chart */}
        <View style={styles.legendContainer}>
          {cleanedDatasets.map((dataset, datasetIndex) => (
            <View key={datasetIndex} style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: dataset.color }]}
              />
              <Text style={styles.legendLabel}>{dataset.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // For line charts - manage x-axis labels when there are too many
  const manageXAxisLabels = (labels: string[]): string[] => {
    // If we have more than 15 labels, show every 2nd or 3rd label
    if (labels.length > 15) {
      const step = labels.length > 30 ? 3 : 2; // Show every 3rd if > 30, every 2nd if > 15
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
      strokeWidth: 2,
    })),
    legend: data.datasets.map((d) => d.label),
  };

  // Use container width for full width chart
  const chartWidth = containerWidth;

  return (
    <>
      {title && !showFullscreenButton && (
        <Text style={styles.title}>{title}</Text>
      )}
      {showFullscreenButton && onFullscreen && (
        <View style={styles.fullscreenButtonContainer}>
          <TouchableOpacity
            onPress={onFullscreen}
            style={styles.fullscreenButton}
          >
            <MaterialCommunityIcons
              name="fullscreen"
              size={20}
              color="#ec4899"
            />
          </TouchableOpacity>
        </View>
      )}
      <View
        style={styles.chartWrapper}
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          setContainerWidth(width);
        }}
      >
        <LineChart
          data={chartData}
          width={chartWidth}
          height={height - 40}
          chartConfig={lineChartConfig}
          bezier
          style={styles.chart}
          withVerticalLabels={true}
          withHorizontalLabels={true}
          segments={4}
          withInnerLines={true}
          withOuterLines={false}
          fromZero={false}
          yAxisLabel=""
          yAxisSuffix=""
          xAxisLabel=""
          formatYLabel={(value) => {
            // Format labels to be shorter
            const num = parseFloat(value);
            if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
            return num.toFixed(0);
          }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    width: "103%",
  },
  chartWrapper: {
    width: "100%",
    alignItems: "center",
    overflow: "hidden",
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
    marginLeft: -30,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 16,
    textAlign: "center",
  },
  fullscreenButtonContainer: {
    position: "absolute",
    top: 8,
    right: 16,
    zIndex: 10,
  },
  fullscreenButton: {
    padding: 8,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderRadius: 8,
  },
  placeholder: {
    height: 250,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 20,
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9CA3AF",
    marginBottom: 8,
    textAlign: "center",
  },
  placeholderSubtext: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    textAlign: "center",
  },
  pieChartWrapper: {
    width: screenWidth - 64,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  legendContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    paddingHorizontal: 16,
    gap: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "500",
    marginRight: 4,
  },
  legendValue: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "400",
  },
});
