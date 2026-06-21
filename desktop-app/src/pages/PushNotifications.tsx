import React, { useState, useEffect } from "react";
import {
  Send,
  History,
  BarChart3,
  RefreshCw,
  Users,
  CheckCircle2,
  XCircle,
  MousePointerClick,
  Eye,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import ApiService from "../services/apiService";
import { toast } from "../components/Toast";
import Switch from "../components/Switch";
import PageHeader from "../components/PageHeader";

interface NotificationFormData {
  title: string;
  message: string;
  image: string;
  includeAction: boolean;
  actionUrl: string;
  actionLabel: string;
}

interface NotificationHistory {
  id: string;
  title: string;
  message: string;
  image: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  totalRecipients: number;
  createdAt: string;
  stats: {
    delivered: number;
    failed: number;
    clicked: number;
    clickRate: number;
  };
}

interface Stats {
  totalSubscribers: number;
  notificationsSentToday: number;
  notificationsSentThisWeek: number;
  notificationsSentThisMonth: number;
  averageClickRate: number;
  deliverySuccessRate: number;
}

const PushNotifications: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<"send" | "history" | "stats">("send");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<NotificationFormData>({
    title: "",
    message: "",
    image: "",
    includeAction: false,
    actionUrl: "",
    actionLabel: "",
  });
  const [history, setHistory] = useState<NotificationHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotificationHistory | null>(null);

  const apiService = ApiService.getInstance();

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    } else if (activeTab === "stats") {
      loadStats();
    }
  }, [activeTab, historyPage]);

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const token = await getToken();
      const response = await apiService.get(
        `/api/admin/push-notifications/history?page=${historyPage}&limit=20`,
        token || undefined
      );

      if (response.success && response.data) {
        setHistory(response.data.notifications || []);
        setHistoryTotalPages(response.data.pagination?.pages || 1);
      }
    } catch (error: any) {
      console.error("Error loading history:", error);
      toast.error(t("admin.pushNotifications.history.loadError"));
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      setStatsLoading(true);
      const token = await getToken();

      // Get total subscribers
      const subscribersResponse = await apiService.get(
        `/api/admin/push-notifications/subscribers/count`,
        token || undefined
      );

      // Get history for calculating stats
      const historyResponse = await apiService.get(
        `/api/admin/push-notifications/history?page=1&limit=100`,
        token || undefined
      );

      if (
        subscribersResponse.success &&
        historyResponse.success &&
        historyResponse.data
      ) {
        const notifications = historyResponse.data.notifications || [];
        const now = new Date();
        const today = new Date(now.setHours(0, 0, 0, 0));
        const weekAgo = new Date(now.setDate(now.getDate() - 7));
        const monthAgo = new Date(now.setDate(now.getDate() - 30));

        const todayCount = notifications.filter(
          (n: NotificationHistory) => new Date(n.createdAt) >= today
        ).length;

        const weekCount = notifications.filter(
          (n: NotificationHistory) => new Date(n.createdAt) >= weekAgo
        ).length;

        const monthCount = notifications.filter(
          (n: NotificationHistory) => new Date(n.createdAt) >= monthAgo
        ).length;

        const totalClickRate =
          notifications.reduce(
            (sum: number, n: NotificationHistory) =>
              sum + (n.stats?.clickRate || 0),
            0
          ) / (notifications.length || 1);

        const totalDelivered = notifications.reduce(
          (sum: number, n: NotificationHistory) =>
            sum + (n.stats?.delivered || 0),
          0
        );

        const totalFailed = notifications.reduce(
          (sum: number, n: NotificationHistory) => sum + (n.stats?.failed || 0),
          0
        );

        const successRate =
          totalDelivered + totalFailed > 0
            ? (totalDelivered / (totalDelivered + totalFailed)) * 100
            : 100;

        setStats({
          totalSubscribers: subscribersResponse.data?.count || 0,
          notificationsSentToday: todayCount,
          notificationsSentThisWeek: weekCount,
          notificationsSentThisMonth: monthCount,
          averageClickRate: parseFloat(totalClickRate.toFixed(2)),
          deliverySuccessRate: parseFloat(successRate.toFixed(2)),
        });
      }
    } catch (error: any) {
      console.error("Error loading stats:", error);
      toast.error(t("admin.pushNotifications.statistics.loadError"));
    } finally {
      setStatsLoading(false);
    }
  };

  const handleSend = async () => {
    // Validation
    if (!formData.title.trim()) {
      toast.error(t("admin.pushNotifications.send.titleRequired"));
      return;
    }

    if (!formData.message.trim()) {
      toast.error(t("admin.pushNotifications.send.messageRequired"));
      return;
    }

    if (formData.title.length > 100) {
      toast.error(t("admin.pushNotifications.send.titleMaxLength"));
      return;
    }

    if (formData.message.length > 500) {
      toast.error(t("admin.pushNotifications.send.messageMaxLength"));
      return;
    }

    if (formData.includeAction) {
      if (!formData.actionUrl.trim()) {
        toast.error(t("admin.pushNotifications.send.actionUrlRequired"));
        return;
      }
      if (!formData.actionLabel.trim()) {
        toast.error(t("admin.pushNotifications.send.buttonLabelRequired"));
        return;
      }
    }

    if (formData.image && formData.image.trim()) {
      try {
        new URL(formData.image);
      } catch {
        toast.error(t("admin.pushNotifications.send.invalidImageUrl"));
        return;
      }
    }

    try {
      setLoading(true);
      const token = await getToken();
      const payload: any = {
        title: formData.title,
        message: formData.message,
      };

      if (formData.image.trim()) {
        payload.image = formData.image;
      }

      if (formData.includeAction) {
        payload.actionUrl = formData.actionUrl;
        payload.actionLabel = formData.actionLabel;
      }

      const response = await apiService.post(
        `/api/admin/push-notifications/send`,
        payload,
        token || undefined
      );

      if (response.success) {
        toast.success(
          t("admin.pushNotifications.send.sendSuccess", { count: response.data?.totalRecipients || 0 })
        );

        // Reset form
        setFormData({
          title: "",
          message: "",
          image: "",
          includeAction: false,
          actionUrl: "",
          actionLabel: "",
        });

        // Refresh history if on history tab
        if (activeTab === "history") {
          loadHistory();
        }
      } else {
        toast.error(response.error || t("admin.pushNotifications.send.sendError"));
      }
    } catch (error: any) {
      console.error("Error sending notification:", error);
      toast.error(error.message || t("admin.pushNotifications.send.sendError"));
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (notification: NotificationHistory) => {
    setSelectedNotification(notification);
  };

  const handleCloseDetails = () => {
    setSelectedNotification(null);
  };

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px", height: "100%", overflow: "auto" }}>
      {/* Header */}
      <PageHeader
        title={t("admin.pushNotifications.title")}
        description={t("admin.pushNotifications.description")}
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #e5e7eb" }}>
        <button
          onClick={() => setActiveTab("send")}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: "500",
            border: "none",
            borderBottom: activeTab === "send" ? "2px solid #ec4899" : "2px solid transparent",
            backgroundColor: "transparent",
            color: activeTab === "send" ? "#ec4899" : "#6b7280",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Send style={{ height: "16px", width: "16px" }} />
          {t("admin.pushNotifications.tabs.send")}
        </button>
        <button
          onClick={() => setActiveTab("history")}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: "500",
            border: "none",
            borderBottom: activeTab === "history" ? "2px solid #ec4899" : "2px solid transparent",
            backgroundColor: "transparent",
            color: activeTab === "history" ? "#ec4899" : "#6b7280",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <History style={{ height: "16px", width: "16px" }} />
          {t("admin.pushNotifications.tabs.history")}
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: "500",
            border: "none",
            borderBottom: activeTab === "stats" ? "2px solid #ec4899" : "2px solid transparent",
            backgroundColor: "transparent",
            color: activeTab === "stats" ? "#ec4899" : "#6b7280",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <BarChart3 style={{ height: "16px", width: "16px" }} />
          {t("admin.pushNotifications.tabs.statistics")}
        </button>
      </div>

      {/* Send Notification Tab */}
      {activeTab === "send" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#111827", margin: "0 0 8px 0" }}>
            {t("admin.pushNotifications.send.title")}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 24px 0" }}>
            {t("admin.pushNotifications.send.description")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                htmlFor="title"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                }}
              >
                {t("admin.pushNotifications.send.titleLabel")} <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t("admin.pushNotifications.send.titlePlaceholder")}
                maxLength={100}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#ec4899";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <p style={{ fontSize: "12px", color: "#6b7280", margin: 0 }}>
                {formData.title.length}/100 {t("admin.pushNotifications.send.titleCharCount")}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                htmlFor="message"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                }}
              >
                {t("admin.pushNotifications.send.messageLabel")} <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <textarea
                id="message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder={t("admin.pushNotifications.send.messagePlaceholder")}
                rows={4}
                maxLength={500}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#ec4899";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <p style={{ fontSize: "12px", color: "#6b7280", margin: 0 }}>
                {formData.message.length}/500 {t("admin.pushNotifications.send.messageCharCount")}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                htmlFor="image"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                }}
              >
                {t("admin.pushNotifications.send.imageUrlLabel")}
              </label>
              <input
                id="image"
                type="url"
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                placeholder={t("admin.pushNotifications.send.imageUrlPlaceholder")}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#ec4899";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              {formData.image && (
                <div style={{ marginTop: "8px" }}>
                  <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
                    {t("admin.pushNotifications.send.imagePreview")}
                  </p>
                  <img
                    src={formData.image}
                    alt="Preview"
                    style={{
                      maxWidth: "300px",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Switch
                id="includeAction"
                checked={formData.includeAction}
                onCheckedChange={(checked: boolean) =>
                  setFormData({ ...formData, includeAction: checked })
                }
              />
              <label
                htmlFor="includeAction"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  cursor: "pointer",
                }}
              >
                {t("admin.pushNotifications.send.includeActionButton")}
              </label>
            </div>

            {formData.includeAction && (
              <div
                style={{
                  paddingLeft: "24px",
                  borderLeft: "2px solid #fce7f3",
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label
                    htmlFor="actionUrl"
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                    }}
                  >
                    {t("admin.pushNotifications.send.actionUrlLabel")} <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    id="actionUrl"
                    type="url"
                    value={formData.actionUrl}
                    onChange={(e) => setFormData({ ...formData, actionUrl: e.target.value })}
                    placeholder={t("admin.pushNotifications.send.actionUrlPlaceholder")}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      outline: "none",
                      backgroundColor: "#ffffff",
                      color: "#111827",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#ec4899";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label
                    htmlFor="actionLabel"
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                    }}
                  >
                    {t("admin.pushNotifications.send.buttonLabel")} <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    id="actionLabel"
                    type="text"
                    value={formData.actionLabel}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        actionLabel: e.target.value,
                      })
                    }
                    placeholder={t("admin.pushNotifications.send.buttonLabelPlaceholder")}
                    maxLength={20}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      outline: "none",
                      backgroundColor: "#ffffff",
                      color: "#111827",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#ec4899";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 24px",
                fontSize: "14px",
                fontWeight: "500",
                border: "none",
                borderRadius: "8px",
                backgroundColor: loading ? "#d1d5db" : "#ec4899",
                color: "#ffffff",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "#db2777";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "#ec4899";
                }
              }}
            >
              {loading ? (
                <>
                  <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} />
                  {t("admin.pushNotifications.send.sending")}
                </>
              ) : (
                <>
                  <Send style={{ height: "16px", width: "16px" }} />
                  {t("admin.pushNotifications.send.sendToAllUsers")}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#111827", margin: "0 0 8px 0" }}>
            {t("admin.pushNotifications.history.title")}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 24px 0" }}>
            {t("admin.pushNotifications.history.description")}
          </p>
          {historyLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px" }}>
              <RefreshCw style={{ height: "24px", width: "24px", animation: "spin 1s linear infinite", color: "#ec4899" }} />
            </div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px", color: "#6b7280" }}>
              {t("admin.pushNotifications.history.noNotifications")}
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                        {t("admin.pushNotifications.history.tableHeaders.title")}
                      </th>
                      <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                        {t("admin.pushNotifications.history.tableHeaders.date")}
                      </th>
                      <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                        {t("admin.pushNotifications.history.tableHeaders.recipients")}
                      </th>
                      <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                        {t("admin.pushNotifications.history.tableHeaders.delivered")}
                      </th>
                      <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                        {t("admin.pushNotifications.history.tableHeaders.clicked")}
                      </th>
                      <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                        {t("admin.pushNotifications.history.tableHeaders.clickRate")}
                      </th>
                      <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "500", color: "#111827" }}>
                        {t("admin.pushNotifications.history.tableHeaders.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((notification) => (
                      <tr key={notification.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#111827", fontWeight: "500" }}>
                          {notification.title}
                        </td>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#111827" }}>
                          {new Date(notification.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#111827" }}>
                          {notification.totalRecipients}
                        </td>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#111827" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#16a34a" }}>
                            <CheckCircle2 style={{ height: "16px", width: "16px" }} />
                            {notification.stats.delivered}
                          </div>
                        </td>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#111827" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <MousePointerClick style={{ height: "16px", width: "16px" }} />
                            {notification.stats.clicked}
                          </div>
                        </td>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#111827" }}>
                          {notification.stats.clickRate.toFixed(1)}%
                        </td>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#111827" }}>
                          <button
                            onClick={() => handleViewDetails(notification)}
                            style={{
                              padding: "6px 12px",
                              fontSize: "14px",
                              border: "none",
                              borderRadius: "6px",
                              backgroundColor: "transparent",
                              color: "#111827",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#f9fafb";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            <Eye style={{ height: "16px", width: "16px" }} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {historyTotalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "24px" }}>
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    style={{
                      padding: "8px 16px",
                      fontSize: "14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      backgroundColor: historyPage === 1 ? "#f9fafb" : "#ffffff",
                      color: historyPage === 1 ? "#9ca3af" : "#111827",
                      cursor: historyPage === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    {t("admin.pushNotifications.history.pagination.previous")}
                  </button>
                  <span style={{ display: "flex", alignItems: "center", padding: "0 16px", fontSize: "14px", color: "#6b7280" }}>
                    {t("admin.pushNotifications.history.pagination.pageOf", { page: historyPage, total: historyTotalPages })}
                  </span>
                  <button
                    onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                    disabled={historyPage === historyTotalPages}
                    style={{
                      padding: "8px 16px",
                      fontSize: "14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      backgroundColor: historyPage === historyTotalPages ? "#f9fafb" : "#ffffff",
                      color: historyPage === historyTotalPages ? "#9ca3af" : "#111827",
                      cursor: historyPage === historyTotalPages ? "not-allowed" : "pointer",
                    }}
                  >
                    {t("admin.pushNotifications.history.pagination.next")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Statistics Tab */}
      {activeTab === "stats" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                {t("admin.pushNotifications.statistics.totalSubscribers")}
              </h4>
              <Users style={{ height: "16px", width: "16px", color: "#6b7280" }} />
            </div>
            {statsLoading ? (
              <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} />
            ) : (
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827" }}>
                {stats?.totalSubscribers || 0}
              </div>
            )}
          </div>

          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                {t("admin.pushNotifications.statistics.sentToday")}
              </h4>
              <Send style={{ height: "16px", width: "16px", color: "#6b7280" }} />
            </div>
            {statsLoading ? (
              <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} />
            ) : (
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827" }}>
                {stats?.notificationsSentToday || 0}
              </div>
            )}
          </div>

          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                {t("admin.pushNotifications.statistics.sentThisWeek")}
              </h4>
              <Send style={{ height: "16px", width: "16px", color: "#6b7280" }} />
            </div>
            {statsLoading ? (
              <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} />
            ) : (
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827" }}>
                {stats?.notificationsSentThisWeek || 0}
              </div>
            )}
          </div>

          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                {t("admin.pushNotifications.statistics.sentThisMonth")}
              </h4>
              <Send style={{ height: "16px", width: "16px", color: "#6b7280" }} />
            </div>
            {statsLoading ? (
              <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} />
            ) : (
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827" }}>
                {stats?.notificationsSentThisMonth || 0}
              </div>
            )}
          </div>

          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                {t("admin.pushNotifications.statistics.averageClickRate")}
              </h4>
              <MousePointerClick style={{ height: "16px", width: "16px", color: "#6b7280" }} />
            </div>
            {statsLoading ? (
              <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} />
            ) : (
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827" }}>
                {stats?.averageClickRate || 0}%
              </div>
            )}
          </div>

          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: "500", color: "#111827", margin: 0 }}>
                {t("admin.pushNotifications.statistics.deliverySuccessRate")}
              </h4>
              <CheckCircle2 style={{ height: "16px", width: "16px", color: "#6b7280" }} />
            </div>
            {statsLoading ? (
              <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} />
            ) : (
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827" }}>
                {stats?.deliverySuccessRate || 0}%
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notification Details Modal */}
      {selectedNotification && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleCloseDetails}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#111827", margin: 0 }}>
                {t("admin.pushNotifications.details.title")}
              </h3>
              <button
                onClick={handleCloseDetails}
                style={{
                  padding: "4px",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  color: "#6b7280",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#111827";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#6b7280";
                }}
              >
                <XCircle style={{ height: "20px", width: "20px" }} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", display: "block", marginBottom: "4px" }}>
                  {t("admin.pushNotifications.details.notificationTitle")}
                </label>
                <p style={{ fontSize: "14px", color: "#111827", margin: 0 }}>{selectedNotification.title}</p>
              </div>
              <div>
                <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", display: "block", marginBottom: "4px" }}>
                  {t("admin.pushNotifications.details.message")}
                </label>
                <p style={{ fontSize: "14px", color: "#111827", margin: 0 }}>{selectedNotification.message}</p>
              </div>
              {selectedNotification.image && (
                <div>
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", display: "block", marginBottom: "4px" }}>
                    {t("admin.pushNotifications.details.image")}
                  </label>
                  <img
                    src={selectedNotification.image}
                    alt="Notification"
                    style={{ marginTop: "8px", maxWidth: "300px", borderRadius: "8px" }}
                  />
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", display: "block", marginBottom: "4px" }}>
                    {t("admin.pushNotifications.details.totalRecipients")}
                  </label>
                  <p style={{ fontSize: "18px", fontWeight: "600", color: "#111827", margin: 0 }}>
                    {selectedNotification.totalRecipients}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", display: "block", marginBottom: "4px" }}>
                    {t("admin.pushNotifications.details.sentDate")}
                  </label>
                  <p style={{ fontSize: "14px", color: "#111827", margin: 0 }}>
                    {new Date(selectedNotification.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", display: "block", marginBottom: "4px" }}>
                    {t("admin.pushNotifications.details.delivered")}
                  </label>
                  <p style={{ fontSize: "18px", fontWeight: "600", color: "#16a34a", margin: 0 }}>
                    {selectedNotification.stats.delivered}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", display: "block", marginBottom: "4px" }}>
                    {t("admin.pushNotifications.details.failed")}
                  </label>
                  <p style={{ fontSize: "18px", fontWeight: "600", color: "#dc2626", margin: 0 }}>
                    {selectedNotification.stats.failed}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", display: "block", marginBottom: "4px" }}>
                    {t("admin.pushNotifications.details.clicked")}
                  </label>
                  <p style={{ fontSize: "18px", fontWeight: "600", color: "#111827", margin: 0 }}>
                    {selectedNotification.stats.clicked}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: "14px", fontWeight: "500", color: "#111827", display: "block", marginBottom: "4px" }}>
                    {t("admin.pushNotifications.details.clickRate")}
                  </label>
                  <p style={{ fontSize: "18px", fontWeight: "600", color: "#111827", margin: 0 }}>
                    {selectedNotification.stats.clickRate.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default PushNotifications;

