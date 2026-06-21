import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Icon from "@mdi/react";
import { mdiChartBar, mdiRefresh, mdiAccountGroup, mdiCheckCircle, mdiCloseCircle, mdiEye, mdiSend, mdiHistory, mdiCursorDefaultClick } from "@mdi/js";
import { toast } from "sonner";
import ApiService from "@/services/apiService";
import { usePermissions } from "@/contexts/PermissionContext";

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
  const { isSuperAdmin } = usePermissions();
  const [activeTab, setActiveTab] = useState<"send" | "history" | "stats">(
    "send"
  );
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
  const [selectedNotification, setSelectedNotification] =
    useState<NotificationHistory | null>(null);

  const apiService = ApiService.getInstance();

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="text-sm text-muted-foreground">Access denied</div>
      </div>
    );
  }

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
      toast.error(t("admin.pushNotifications.send.loadHistoryError"));
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
        toast.error(t("admin.pushNotifications.send.imageUrlInvalid"));
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
          t("admin.pushNotifications.send.sendSuccess", {
            count: response.data?.totalRecipients || 0,
          }),
          {
            duration: 4000,
          }
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
        toast.error(
          response.error || t("admin.pushNotifications.send.sendError")
        );
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
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-pink-500">
          {t("admin.pushNotifications.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("admin.pushNotifications.description")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("send")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "send"
              ? "border-pink-500 text-pink-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon path={mdiSend} size={0.67} className="inline mr-2" />
          {t("admin.pushNotifications.tabs.send")}
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "history"
              ? "border-pink-500 text-pink-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon path={mdiHistory} size={0.67} className="inline mr-2" />
          {t("admin.pushNotifications.tabs.history")}
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "stats"
              ? "border-pink-500 text-pink-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon path={mdiChartBar} size={0.67} className="inline mr-2" />
          {t("admin.pushNotifications.tabs.statistics")}
        </button>
      </div>

      {/* Send Notification Tab */}
      {activeTab === "send" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.pushNotifications.send.title")}</CardTitle>
            <CardDescription>
              {t("admin.pushNotifications.send.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                {t("admin.pushNotifications.send.titleLabel")}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder={t("admin.pushNotifications.send.titlePlaceholder")}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                {formData.title.length}/100{" "}
                {t("admin.pushNotifications.send.characters")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">
                {t("admin.pushNotifications.send.messageLabel")}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) =>
                  setFormData({ ...formData, message: e.target.value })
                }
                placeholder={t(
                  "admin.pushNotifications.send.messagePlaceholder"
                )}
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {formData.message.length}/500{" "}
                {t("admin.pushNotifications.send.characters")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image">
                {t("admin.pushNotifications.send.imageUrl")}
              </Label>
              <Input
                id="image"
                type="url"
                value={formData.image}
                onChange={(e) =>
                  setFormData({ ...formData, image: e.target.value })
                }
                placeholder={t(
                  "admin.pushNotifications.send.imageUrlPlaceholder"
                )}
              />
              {formData.image && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-2">
                    {t("admin.pushNotifications.send.imagePreview")}
                  </p>
                  <img
                    src={formData.image}
                    alt="Preview"
                    className="max-w-xs rounded-lg border"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="includeAction"
                checked={formData.includeAction}
                onCheckedChange={(checked: boolean) =>
                  setFormData({ ...formData, includeAction: checked })
                }
              />
              <Label htmlFor="includeAction">
                {t("admin.pushNotifications.send.includeAction")}
              </Label>
            </div>

            {formData.includeAction && (
              <div className="space-y-4 pl-6 border-l-2 border-pink-200">
                <div className="space-y-2">
                  <Label htmlFor="actionUrl">
                    {t("admin.pushNotifications.send.actionUrl")}{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="actionUrl"
                    type="url"
                    value={formData.actionUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, actionUrl: e.target.value })
                    }
                    placeholder={t(
                      "admin.pushNotifications.send.actionUrlPlaceholder"
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="actionLabel">
                    {t("admin.pushNotifications.send.buttonLabel")}{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="actionLabel"
                    value={formData.actionLabel}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        actionLabel: e.target.value,
                      })
                    }
                    placeholder={t(
                      "admin.pushNotifications.send.buttonLabelPlaceholder"
                    )}
                    maxLength={20}
                  />
                </div>
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={loading}
              className="w-full bg-pink-500 hover:bg-pink-600 text-white"
            >
              {loading ? (
                <>
                  <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                  {t("admin.pushNotifications.send.sending")}
                </>
              ) : (
                <>
                  <Icon path={mdiSend} size={0.67} className="mr-2" />
                  {t("admin.pushNotifications.send.sendToAllUsers")}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.pushNotifications.history.title")}</CardTitle>
            <CardDescription>
              {t("admin.pushNotifications.history.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Icon path={mdiRefresh} size={1.00} className="animate-spin text-pink-500" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t("admin.pushNotifications.history.empty")}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {t("admin.pushNotifications.history.table.title")}
                        </TableHead>
                        <TableHead>
                          {t("admin.pushNotifications.history.table.date")}
                        </TableHead>
                        <TableHead>
                          {t(
                            "admin.pushNotifications.history.table.recipients"
                          )}
                        </TableHead>
                        <TableHead>
                          {t("admin.pushNotifications.history.table.delivered")}
                        </TableHead>
                        <TableHead>
                          {t("admin.pushNotifications.history.table.clicked")}
                        </TableHead>
                        <TableHead>
                          {t("admin.pushNotifications.history.table.clickRate")}
                        </TableHead>
                        <TableHead>
                          {t("admin.pushNotifications.history.table.actions")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((notification) => (
                        <TableRow key={notification.id}>
                          <TableCell className="font-medium">
                            {notification.title}
                          </TableCell>
                          <TableCell>
                            {new Date(
                              notification.createdAt
                            ).toLocaleDateString()}
                          </TableCell>
                          <TableCell>{notification.totalRecipients}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-green-600">
                              <Icon path={mdiCheckCircle} size={0.67} />
                              {notification.stats.delivered}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Icon path={mdiCursorDefaultClick} size={0.67} />
                              {notification.stats.clicked}
                            </div>
                          </TableCell>
                          <TableCell>
                            {notification.stats.clickRate.toFixed(1)}%
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(notification)}
                            >
                              <Icon path={mdiEye} size={0.67} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {historyTotalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={historyPage === 1}
                    >
                      {t("admin.pushNotifications.history.pagination.previous")}
                    </Button>
                    <span className="flex items-center px-4 text-sm text-muted-foreground">
                      {t("admin.pushNotifications.history.pagination.pageOf", {
                        current: historyPage,
                        total: historyTotalPages,
                      })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setHistoryPage((p) =>
                          Math.min(historyTotalPages, p + 1)
                        )
                      }
                      disabled={historyPage === historyTotalPages}
                    >
                      {t("admin.pushNotifications.history.pagination.next")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Statistics Tab */}
      {activeTab === "stats" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("admin.pushNotifications.statistics.totalSubscribers")}
              </CardTitle>
              <Icon path={mdiAccountGroup} size={0.67} className="text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Icon path={mdiRefresh} size={0.67} className="animate-spin" />
              ) : (
                <div className="text-2xl font-bold">
                  {stats?.totalSubscribers || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("admin.pushNotifications.statistics.sentToday")}
              </CardTitle>
              <Icon path={mdiSend} size={0.67} className="text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Icon path={mdiRefresh} size={0.67} className="animate-spin" />
              ) : (
                <div className="text-2xl font-bold">
                  {stats?.notificationsSentToday || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("admin.pushNotifications.statistics.sentThisWeek")}
              </CardTitle>
              <Icon path={mdiSend} size={0.67} className="text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Icon path={mdiRefresh} size={0.67} className="animate-spin" />
              ) : (
                <div className="text-2xl font-bold">
                  {stats?.notificationsSentThisWeek || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("admin.pushNotifications.statistics.sentThisMonth")}
              </CardTitle>
              <Icon path={mdiSend} size={0.67} className="text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Icon path={mdiRefresh} size={0.67} className="animate-spin" />
              ) : (
                <div className="text-2xl font-bold">
                  {stats?.notificationsSentThisMonth || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("admin.pushNotifications.statistics.averageClickRate")}
              </CardTitle>
              <Icon path={mdiCursorDefaultClick} size={0.67} className="text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Icon path={mdiRefresh} size={0.67} className="animate-spin" />
              ) : (
                <div className="text-2xl font-bold">
                  {stats?.averageClickRate || 0}%
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("admin.pushNotifications.statistics.deliverySuccessRate")}
              </CardTitle>
              <Icon path={mdiCheckCircle} size={0.67} className="text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Icon path={mdiRefresh} size={0.67} className="animate-spin" />
              ) : (
                <div className="text-2xl font-bold">
                  {stats?.deliverySuccessRate || 0}%
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Notification Details Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {t("admin.pushNotifications.details.title")}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={handleCloseDetails}>
                  <Icon path={mdiCloseCircle} size={0.67} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium">
                  {t("admin.pushNotifications.details.notificationTitle")}
                </Label>
                <p className="mt-1">{selectedNotification.title}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">
                  {t("admin.pushNotifications.details.message")}
                </Label>
                <p className="mt-1">{selectedNotification.message}</p>
              </div>
              {selectedNotification.image && (
                <div>
                  <Label className="text-sm font-medium">
                    {t("admin.pushNotifications.details.image")}
                  </Label>
                  <img
                    src={selectedNotification.image}
                    alt="Notification"
                    className="mt-2 max-w-xs rounded-lg"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">
                    {t("admin.pushNotifications.details.totalRecipients")}
                  </Label>
                  <p className="mt-1 text-lg font-semibold">
                    {selectedNotification.totalRecipients}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">
                    {t("admin.pushNotifications.details.sentDate")}
                  </Label>
                  <p className="mt-1">
                    {new Date(selectedNotification.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">
                    {t("admin.pushNotifications.details.delivered")}
                  </Label>
                  <p className="mt-1 text-lg font-semibold text-green-600">
                    {selectedNotification.stats.delivered}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">
                    {t("admin.pushNotifications.details.failed")}
                  </Label>
                  <p className="mt-1 text-lg font-semibold text-red-600">
                    {selectedNotification.stats.failed}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">
                    {t("admin.pushNotifications.details.clicked")}
                  </Label>
                  <p className="mt-1 text-lg font-semibold">
                    {selectedNotification.stats.clicked}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">
                    {t("admin.pushNotifications.details.clickRate")}
                  </Label>
                  <p className="mt-1 text-lg font-semibold">
                    {selectedNotification.stats.clickRate.toFixed(2)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PushNotifications;
