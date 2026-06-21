import React, { useState, useEffect, useRef } from "react";
import {
  BarChart3,
  TrendingUp,
  Package,
  DollarSign,
  ShoppingCart,
  Calendar,
  ChevronDown,
  PieChart,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useAdminWebSocket } from "../contexts/AdminWebSocketContext";
import { usePermissions } from "../contexts/PermissionContext";
import { categoryInsightsService } from "../services/categoryInsightsService";
import type { CategoryInsightsData } from "../services/categoryInsightsService";
import Chart, { type ChartData } from "../components/admin/Chart";
import { formatPrice } from "../utils/currency";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import branchService, { type Branch } from "@/services/branchService";
import PageHeader from "@/components/PageHeader";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const getSelectedOrganizationId = (): string | null => {
  try {
    const raw = window.localStorage.getItem(ORG_STORAGE_KEY);
    if (!raw) return null;
    const val = raw.trim();
    return val.length > 0 ? val : null;
  } catch {
    return null;
  }
};

const CategoryInsights: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { subscribe } = useAdminWebSocket();
  const { assignedBranchIds, isSuperAdmin, isOrgAdmin } = usePermissions();
  const canSelectAllBranches = isSuperAdmin || isOrgAdmin;
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(
    getSelectedOrganizationId()
  );
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    canSelectAllBranches ? "all" : ""
  );
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("last_30_days");
  const [insightsData, setInsightsData] = useState<CategoryInsightsData | null>(
    null
  );
  const [salesOverTimeData, setSalesOverTimeData] = useState<CategoryInsightsData["salesOverTime"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSalesOverTime, setLoadingSalesOverTime] = useState(false);
  const [branchRevenueChartData, setBranchRevenueChartData] = useState<any | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const periodDropdownRef = useRef<HTMLDivElement>(null);

  const timePeriods = [
    { value: "today", label: t("admin.categoryInsights.periods.today") },
    { value: "this_week", label: t("admin.categoryInsights.periods.thisWeek") },
    { value: "this_month", label: t("admin.categoryInsights.periods.thisMonth") },
    { value: "last_7_days", label: t("admin.categoryInsights.periods.last7Days") },
    { value: "last_30_days", label: t("admin.categoryInsights.periods.last30Days") },
    { value: "last_3_months", label: t("admin.categoryInsights.periods.last3Months") },
    { value: "last_6_months", label: t("admin.categoryInsights.periods.last6Months") },
    { value: "last_year", label: t("admin.categoryInsights.periods.lastYear") },
  ];

  // Fetch available categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const token = await getToken();
        if (!token) {
          setCategories([]);
          setSelectedCategory("");
          return;
        }
        const categoriesData = await categoryInsightsService.getCategories(
          token
        );
        setCategories(categoriesData);
        if (categoriesData.length > 0) {
          setSelectedCategory(categoriesData[0]);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };

    fetchCategories();
  }, [getToken, selectedOrganizationId]);

  useEffect(() => {
    const loadBranches = async () => {
      try {
        setLoadingBranches(true);
        const token = await getToken();
        const fetchedBranches = await branchService.getBranches(token || undefined);
        setBranches(fetchedBranches);

        const branchExists = (id: string) => fetchedBranches.some((b) => b.id === id);
        const allowedBranchIdsForUser = !canSelectAllBranches
          ? assignedBranchIds.filter((id) => branchExists(id))
          : [];

        const isAllowedSelection = (value: string) => {
          if (value === "all") return canSelectAllBranches;
          if (!branchExists(value)) return false;
          if (canSelectAllBranches) return true;
          if (allowedBranchIdsForUser.length > 0) return allowedBranchIdsForUser.includes(value);
          return true;
        };

        const getDefaultSelection = () => {
          if (canSelectAllBranches) return "all";
          if (allowedBranchIdsForUser.length > 0) return allowedBranchIdsForUser[0];
          return fetchedBranches[0]?.id || "";
        };

        setSelectedBranchId((prev) => {
          const nextDefault = getDefaultSelection();

          if (!canSelectAllBranches) {
            if (!prev || prev === "all") return nextDefault;
            if (!isAllowedSelection(prev)) return nextDefault;
            return prev;
          }

          if (prev && isAllowedSelection(prev)) return prev;
          return nextDefault;
        });
      } catch {
        setBranches([]);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, [assignedBranchIds, canSelectAllBranches, getToken, selectedOrganizationId]);

  useEffect(() => {
    const onOrganizationChange = () => {
      const nextOrgId = getSelectedOrganizationId();
      setSelectedOrganizationId(nextOrgId);

      setCategories([]);
      setSelectedCategory("");
      setInsightsData(null);
      setSalesOverTimeData(null);
      setBranchRevenueChartData(null);
      setBranches([]);
      setSelectedBranchId(canSelectAllBranches ? "all" : "");
    };

    window.addEventListener(ORG_CHANGED_EVENT, onOrganizationChange);
    const onStorage = (e: StorageEvent) => {
      if (e.key === ORG_STORAGE_KEY) onOrganizationChange();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(ORG_CHANGED_EVENT, onOrganizationChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [canSelectAllBranches]);

  // Fetch insights data when category or period changes
  useEffect(() => {
    if (selectedCategory) {
      fetchInsightsData();
      fetchSalesOverTimeData(); // Always fetch last 30 days for the chart
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedPeriod, selectedBranchId]);

  // WebSocket connection for real-time category insights updates
  useEffect(() => {
    // Subscribe to new order events with automatic cleanup
    const unsubscribe = subscribe("new-order", () => {
      if (selectedCategory) {
        fetchInsightsData();
        fetchSalesOverTimeData();
      }
    });

    // Cleanup on unmount
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedPeriod, subscribe]); // Include dependencies to refetch with current settings

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setShowCategoryDropdown(false);
      }
      if (
        periodDropdownRef.current &&
        !periodDropdownRef.current.contains(event.target as Node)
      ) {
        setShowPeriodDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const fetchInsightsData = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        setInsightsData(null);
        return;
      }

      const branchIdForApi = selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : undefined;
      const data = await categoryInsightsService.getCategoryInsights(
        selectedCategory,
        selectedPeriod,
        branchIdForApi,
        token
      );
      setInsightsData(data);

      if (selectedBranchId === "all") {
        try {
          const chart = await categoryInsightsService.getBranchRevenueChart(
            selectedCategory,
            selectedPeriod,
            token
          );
          setBranchRevenueChartData(chart);
        } catch {
          setBranchRevenueChartData(null);
        }
      } else {
        setBranchRevenueChartData(null);
      }
    } catch (error) {
      console.error("Error fetching insights data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch sales over time data for the last 30 days (always for the chart)
  const fetchSalesOverTimeData = async () => {
    try {
      setLoadingSalesOverTime(true);
      const token = await getToken();
      if (!token) {
        setSalesOverTimeData(null);
        return;
      }

      const branchIdForApi = selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : undefined;
      const data = await categoryInsightsService.getCategoryInsights(
        selectedCategory,
        "last_30_days", // Always fetch last 30 days for the chart
        branchIdForApi,
        token
      );
      setSalesOverTimeData(data.salesOverTime);
    } catch (error) {
      console.error("Error fetching sales over time data:", error);
    } finally {
      setLoadingSalesOverTime(false);
    }
  };

  const selectedPeriodData = timePeriods.find(
    (p) => p.value === selectedPeriod
  );

  // Prepare chart data - always use last 30 days data for the sales over time chart
  const salesOverTimeChartData = salesOverTimeData && salesOverTimeData.length > 0
    ? {
        labels: salesOverTimeData.map((item) => item.label),
        datasets: [
          {
            label: t("admin.categoryInsights.revenue"),
            data: salesOverTimeData.map((item) => item.revenue),
            borderColor: "rgb(236, 72, 153)",
            backgroundColor: "rgba(236, 72, 153, 0.15)",
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "rgb(236, 72, 153)",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointHoverBackgroundColor: "rgb(236, 72, 153)",
            pointHoverBorderColor: "#ffffff",
            pointHoverBorderWidth: 3,
            yAxisID: "y",
          },
          {
            label: t("admin.categoryInsights.orders"),
            data: salesOverTimeData.map((item) => item.orders),
            borderColor: "rgb(34, 197, 94)",
            backgroundColor: "rgba(34, 197, 94, 0.15)",
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "rgb(34, 197, 94)",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointHoverBackgroundColor: "rgb(34, 197, 94)",
            pointHoverBorderColor: "#ffffff",
            pointHoverBorderWidth: 3,
            yAxisID: "y1",
          },
        ],
      }
    : null;

  const menuItemsData: ChartData | null = insightsData?.menuItems
    ? {
        labels: insightsData.menuItems.map((item) => item.name),
        datasets: [
          {
            label: t("admin.categoryInsights.sales"),
            data: insightsData.menuItems.map((item) => item.sales),
            backgroundColor: [
              "rgba(236, 72, 153, 0.8)",
              "rgba(34, 197, 94, 0.8)",
              "rgba(59, 130, 246, 0.8)",
              "rgba(245, 158, 11, 0.8)",
              "rgba(139, 69, 19, 0.8)",
            ],
            borderColor: [
              "rgb(236, 72, 153)",
              "rgb(34, 197, 94)",
              "rgb(59, 130, 246)",
              "rgb(245, 158, 11)",
              "rgb(139, 69, 19)",
            ],
            borderWidth: 2,
          },
        ],
      }
    : null;

  const addOnsData: ChartData | null = insightsData?.popularAddOns
    ? {
        labels: insightsData.popularAddOns.map((item) => item.name),
        datasets: [
          {
            label: t("admin.categoryInsights.count"),
            data: insightsData.popularAddOns.map((item) => item.count),
            backgroundColor: [
              "rgba(236, 72, 153, 0.8)",
              "rgba(34, 197, 94, 0.8)",
              "rgba(59, 130, 246, 0.8)",
              "rgba(245, 158, 11, 0.8)",
              "rgba(139, 69, 19, 0.8)",
              "rgba(168, 85, 247, 0.8)",
              "rgba(239, 68, 68, 0.8)",
              "rgba(16, 185, 129, 0.8)",
            ],
            borderColor: [
              "rgb(236, 72, 153)",
              "rgb(34, 197, 94)",
              "rgb(59, 130, 246)",
              "rgb(245, 158, 11)",
              "rgb(139, 69, 19)",
              "rgb(168, 85, 247)",
              "rgb(239, 68, 68)",
              "rgb(16, 185, 129)",
            ],
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      }
    : null;

  return (
    <div style={{ padding: "24px", backgroundColor: "#f9fafb", minHeight: "100vh" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <PageHeader
          title={t("admin.categoryInsights.title")}
          description={t("admin.categoryInsights.description")}
        />

        {/* Filters */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          {/* Branch Filter */}
          <div style={{ minWidth: "220px" }}>
            <Label>{t("admin.branches.branch")}</Label>
            <div style={{ marginTop: "6px" }}>
              <Select
                value={selectedBranchId}
                onValueChange={(val) => setSelectedBranchId(val)}
                disabled={loadingBranches}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("common.select")} />
                </SelectTrigger>
                <SelectContent>
                  {canSelectAllBranches ? (
                    <SelectItem value="all">{t("admin.branches.allBranches")}</SelectItem>
                  ) : null}
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category Filter */}
          <div style={{ position: "relative" }} ref={categoryDropdownRef}>
            <button
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: "500",
                color: "#ec4899",
                backgroundColor: "#ffffff",
                border: "1px solid #fce7f3",
                borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                minWidth: "160px",
                justifyContent: "space-between",
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "#fdf2f8";
                  e.currentTarget.style.borderColor = "#ec4899";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                  e.currentTarget.style.borderColor = "#fce7f3";
                }
              }}
            >
              {loading ? (
                <RefreshCw
                  style={{
                    height: "16px",
                    width: "16px",
                    animation: "spin 1s linear infinite",
                  }}
                />
              ) : (
                <Package style={{ height: "16px", width: "16px" }} />
              )}
              <span style={{ flex: 1, textAlign: "left" }}>
                {selectedCategory || t("admin.categoryInsights.selectCategory")}
              </span>
              <ChevronDown style={{ height: "16px", width: "16px" }} />
            </button>
            {showCategoryDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: "4px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                  zIndex: 1000,
                  minWidth: "240px",
                  maxHeight: "300px",
                  overflowY: "auto",
                }}
              >
                {categories.map((category) => (
                  <div
                    key={category}
                    onClick={() => {
                      setSelectedCategory(category);
                      setShowCategoryDropdown(false);
                    }}
                    style={{
                      padding: "12px 16px",
                      cursor: "pointer",
                      fontSize: "14px",
                      color: selectedCategory === category ? "#ec4899" : "#111827",
                      backgroundColor:
                        selectedCategory === category ? "#fdf2f8" : "transparent",
                      borderLeft:
                        selectedCategory === category
                          ? "3px solid #ec4899"
                          : "3px solid transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedCategory !== category) {
                        e.currentTarget.style.backgroundColor = "#f9fafb";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedCategory !== category) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor:
                          selectedCategory === category ? "#ec4899" : "#9ca3af",
                      }}
                    />
                    <span>{category}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Time Period Filter */}
          <div style={{ position: "relative" }} ref={periodDropdownRef}>
            <button
              onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: "500",
                color: "#ec4899",
                backgroundColor: "#ffffff",
                border: "1px solid #fce7f3",
                borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                minWidth: "140px",
                justifyContent: "space-between",
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "#fdf2f8";
                  e.currentTarget.style.borderColor = "#ec4899";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                  e.currentTarget.style.borderColor = "#fce7f3";
                }
              }}
            >
              {loading ? (
                <RefreshCw
                  style={{
                    height: "16px",
                    width: "16px",
                    animation: "spin 1s linear infinite",
                  }}
                />
              ) : (
                <Calendar style={{ height: "16px", width: "16px" }} />
              )}
              <span style={{ flex: 1, textAlign: "left" }}>
                {selectedPeriodData?.label}
              </span>
              <ChevronDown style={{ height: "16px", width: "16px" }} />
            </button>
            {showPeriodDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: "4px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                  zIndex: 1000,
                  minWidth: "200px",
                  maxHeight: "300px",
                  overflowY: "auto",
                }}
              >
                {timePeriods.map((period) => (
                  <div
                    key={period.value}
                    onClick={() => {
                      setSelectedPeriod(period.value);
                      setShowPeriodDropdown(false);
                    }}
                    style={{
                      padding: "12px 16px",
                      cursor: "pointer",
                      fontSize: "14px",
                      color: selectedPeriod === period.value ? "#ec4899" : "#111827",
                      backgroundColor:
                        selectedPeriod === period.value ? "#fdf2f8" : "transparent",
                      borderLeft:
                        selectedPeriod === period.value
                          ? "3px solid #ec4899"
                          : "3px solid transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedPeriod !== period.value) {
                        e.currentTarget.style.backgroundColor = "#f9fafb";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedPeriod !== period.value) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor:
                          selectedPeriod === period.value ? "#ec4899" : "#9ca3af",
                      }}
                    />
                    <span>{period.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <RefreshCw
              style={{
                height: "48px",
                width: "48px",
                color: "#ec4899",
                animation: "spin 1s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                margin: "0 0 8px",
              }}
            >
              {t("admin.categoryInsights.loadingTitle")}
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
              {t("admin.categoryInsights.loadingDescription")}
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {!loading && insightsData && (
        <>
          {selectedBranchId === "all" && branchRevenueChartData ? (
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                padding: "24px",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "16px",
                }}
              >
                <BarChart3 style={{ height: "18px", width: "18px", color: "#ec4899" }} />
                <h3 style={{ fontSize: "16px", fontWeight: "600", margin: 0, color: "#111827" }}>
                  {t("admin.dashboard.branchRevenue")}
                </h3>
              </div>
              <Chart type="bar" data={branchRevenueChartData} height={280} />
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <DollarSign style={{ height: "20px", width: "20px", color: "#ec4899" }} />
                <div>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#6b7280",
                      margin: "0 0 4px",
                    }}
                  >
                    {t("admin.categoryInsights.totalRevenue")}
                  </p>
                  <p
                    style={{
                      fontSize: "24px",
                      fontWeight: "700",
                      color: "#111827",
                      margin: 0,
                    }}
                  >
                    {formatPrice(insightsData.salesData.totalRevenue, "USD")}
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <ShoppingCart
                  style={{ height: "20px", width: "20px", color: "#10b981" }}
                />
                <div>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#6b7280",
                      margin: "0 0 4px",
                    }}
                  >
                    {t("admin.categoryInsights.totalOrders")}
                  </p>
                  <p
                    style={{
                      fontSize: "24px",
                      fontWeight: "700",
                      color: "#111827",
                      margin: 0,
                    }}
                  >
                    {insightsData.salesData.totalOrders}
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Package style={{ height: "20px", width: "20px", color: "#3b82f6" }} />
                <div>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#6b7280",
                      margin: "0 0 4px",
                    }}
                  >
                    {t("admin.categoryInsights.itemsSold")}
                  </p>
                  <p
                    style={{
                      fontSize: "24px",
                      fontWeight: "700",
                      color: "#111827",
                      margin: 0,
                    }}
                  >
                    {insightsData.salesData.totalQuantity}
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <TrendingUp
                  style={{ height: "20px", width: "20px", color: "#8b5cf6" }}
                />
                <div>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#6b7280",
                      margin: "0 0 4px",
                    }}
                  >
                    {t("admin.categoryInsights.avgOrderValue")}
                  </p>
                  <p
                    style={{
                      fontSize: "24px",
                      fontWeight: "700",
                      color: "#111827",
                      margin: 0,
                    }}
                  >
                    {formatPrice(insightsData.salesData.avgOrderValue, "USD")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Sales Over Time - Full Width */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e5e7eb",
              marginBottom: "24px",
            }}
          >
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "4px",
                  }}
                >
                  <BarChart3 style={{ height: "20px", width: "20px", color: "#ec4899" }} />
                  <h3
                    style={{
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#111827",
                      margin: 0,
                    }}
                  >
                    {t("admin.categoryInsights.salesOverTime")}
                  </h3>
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    margin: "0 0 0 28px",
                  }}
                >
                  {t("admin.categoryInsights.last30Days")}
                </p>
              </div>
              {loadingSalesOverTime ? (
                <div
                  style={{
                    height: "250px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6b7280",
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <RefreshCw
                      style={{
                        height: "32px",
                        width: "32px",
                        margin: "0 auto 16px",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    <p style={{ margin: 0 }}>{t("admin.categoryInsights.loadingChartData")}</p>
                  </div>
                </div>
              ) : salesOverTimeChartData ? (
                <Chart type="line" data={salesOverTimeChartData} height={300} />
              ) : (
                <div
                  style={{
                    height: "250px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6b7280",
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <BarChart3
                      style={{
                        height: "48px",
                        width: "48px",
                        margin: "0 auto 16px",
                        opacity: 0.5,
                      }}
                    />
                    <p style={{ margin: 0 }}>{t("admin.categoryInsights.noSalesData")}</p>
                  </div>
                </div>
              )}
            </div>

          {/* Charts Section */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
              gap: "24px",
              marginBottom: "24px",
            }}
          >
            {/* Menu Items Performance */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "16px",
                }}
              >
                <Package style={{ height: "20px", width: "20px", color: "#ec4899" }} />
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    color: "#111827",
                    margin: 0,
                  }}
                >
                  {t("admin.categoryInsights.menuItemsPerformance")}
                </h3>
              </div>
              {menuItemsData ? (
                <Chart type="bar" data={menuItemsData} height={250} />
              ) : (
                <div
                  style={{
                    height: "250px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6b7280",
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <Package
                      style={{
                        height: "48px",
                        width: "48px",
                        margin: "0 auto 16px",
                        opacity: 0.5,
                      }}
                    />
                    <p style={{ margin: 0 }}>{t("admin.categoryInsights.noMenuItemsData")}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Popular Add-ons Chart */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e5e7eb",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "16px",
              }}
            >
              <PieChart style={{ height: "20px", width: "20px", color: "#ec4899" }} />
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#111827",
                  margin: 0,
                }}
              >
                {t("admin.categoryInsights.popularAddons")}
              </h3>
            </div>
            {addOnsData ? (
              <Chart type="doughnut" data={addOnsData} height={250} />
            ) : (
              <div
                style={{
                  height: "250px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6b7280",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <PieChart
                    style={{
                      height: "48px",
                      width: "48px",
                      margin: "0 auto 16px",
                      opacity: 0.5,
                    }}
                  />
                  <p style={{ margin: 0 }}>{t("admin.categoryInsights.noAddonsData")}</p>
                </div>
              </div>
            )}
          </div>

          {/* Menu Items Table */}
          {insightsData.menuItems && insightsData.menuItems.length > 0 && (
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "16px",
                }}
              >
                <Package style={{ height: "20px", width: "20px", color: "#ec4899" }} />
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    color: "#111827",
                    margin: 0,
                  }}
                >
                  {t("admin.categoryInsights.menuItemsBreakdown")}
                </h3>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "12px",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                        }}
                      >
                        {t("admin.categoryInsights.item")}
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "12px",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                        }}
                      >
                        {t("admin.categoryInsights.sales")}
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "12px",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                        }}
                      >
                        {t("admin.categoryInsights.orders")}
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "12px",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                        }}
                      >
                        {t("admin.categoryInsights.qty")}
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "12px",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                        }}
                      >
                        {t("admin.categoryInsights.avg")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {insightsData.menuItems.map((item, index) => (
                      <tr key={index} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td
                          style={{
                            padding: "12px",
                            fontSize: "14px",
                            fontWeight: "500",
                            color: "#111827",
                          }}
                        >
                          {item.name}
                        </td>
                        <td
                          style={{
                            padding: "12px",
                            textAlign: "right",
                            fontSize: "14px",
                            color: "#111827",
                          }}
                        >
                          {formatPrice(item.sales, "USD")}
                        </td>
                        <td
                          style={{
                            padding: "12px",
                            textAlign: "right",
                            fontSize: "14px",
                            color: "#111827",
                          }}
                        >
                          {item.orders}
                        </td>
                        <td
                          style={{
                            padding: "12px",
                            textAlign: "right",
                            fontSize: "14px",
                            color: "#111827",
                          }}
                        >
                          {item.quantity}
                        </td>
                        <td
                          style={{
                            padding: "12px",
                            textAlign: "right",
                            fontSize: "14px",
                            color: "#111827",
                          }}
                        >
                          {formatPrice(item.avgPrice, "USD")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add CSS for spin animation */}
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default CategoryInsights;

