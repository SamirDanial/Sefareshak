import React, { useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export type ChartType = "line" | "bar" | "doughnut";

export type ChartData = {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string | string[];
    backgroundColor?: string | string[];
    tension?: number;
    yAxisID?: string;
    borderWidth?: number;
    hoverOffset?: number;
    fill?: boolean;
    pointRadius?: number;
    pointHoverRadius?: number;
    pointBackgroundColor?: string | string[];
    pointBorderColor?: string | string[];
    pointBorderWidth?: number;
    pointHoverBackgroundColor?: string | string[];
    pointHoverBorderColor?: string | string[];
    pointHoverBorderWidth?: number;
  }>;
};

interface ChartProps {
  type: ChartType;
  data: ChartData;
  title?: string;
  height?: number;
  onElementClick?: (index: number) => void;
}

const Chart: React.FC<ChartProps> = ({ type, data, title, height = 300, onElementClick }) => {
  const chartRef = useRef<any>(null);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: type === "doughnut" ? ("bottom" as const) : ("top" as const),
        labels: {
          color: "#6b7280",
          padding: 20,
          usePointStyle: type === "doughnut",
          pointStyle: "circle",
        },
      },
      title: {
        display: !!title,
        text: title,
        color: "#6b7280",
        font: {
          size: 16,
          weight: "bold" as const,
        },
      },
      tooltip: {
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        titleColor: "white",
        bodyColor: "white",
        borderColor: "rgba(236, 72, 153, 0.5)",
        borderWidth: 1,
        callbacks:
          type === "doughnut"
            ? {
                label: function (context: any) {
                  const label = context.label || "";
                  const value = context.parsed;
                  const total = context.dataset.data.reduce(
                    (a: number, b: number) => a + b,
                    0
                  );
                  const percentage = ((value / total) * 100).toFixed(1);
                  return `${label}: ${value} (${percentage}%)`;
                },
              }
            : undefined,
      },
    },
    onClick: (_event: any, _elements: any, chart: any) => {
      if (!onElementClick) return;
      try {
        const points = chart?.getElementsAtEventForMode?.(
          _event,
          "nearest",
          { intersect: true },
          false
        );
        const idx = points?.[0]?.index;
        if (typeof idx === "number") {
          onElementClick(idx);
        }
      } catch {
        // ignore
      }
    },
    scales:
      type !== "doughnut"
        ? {
            x: {
              grid: {
                color: "rgba(156, 163, 175, 0.1)",
              },
              ticks: {
                color: "#6b7280",
                fontStyle: "normal" as const,
                font: {
                  style: "normal" as const,
                  weight: "normal" as const,
                },
                maxRotation: 0,
                minRotation: 0,
              },
            },
            y: {
              grid: {
                color: "rgba(156, 163, 175, 0.1)",
              },
              ticks: {
                color: "#6b7280",
              },
            },
            y1: {
              type: "linear" as const,
              display: true,
              position: "right" as const,
              grid: {
                drawOnChartArea: false,
              },
              ticks: {
                color: "#6b7280",
              },
            },
          }
        : undefined,
  };

  const renderChart = () => {
    switch (type) {
      case "line":
        return <Line ref={chartRef} data={data} options={options} />;
      case "bar":
        return <Bar ref={chartRef} data={data} options={options} />;
      case "doughnut":
        return <Doughnut ref={chartRef} data={data} options={options} />;
      default:
        return <Line ref={chartRef} data={data} options={options} />;
    }
  };

  return (
    <div style={{ height: `${height}px`, width: "100%" }}>
      {renderChart()}
    </div>
  );
};

export default Chart;

