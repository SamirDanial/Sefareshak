import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

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

export default function PushNotificationsScreen() {
  const { t } = useTranslation();
  const { getToken } = useAuthRole();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();
  const [activeTab, setActiveTab] = useState<"send" | "history" | "stats">(
    "send"
  );

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  };
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
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

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
      const res = await fetch(
        `${API_BASE_URL}/api/admin/push-notifications/history?page=${historyPage}&limit=20`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        setHistory(json.data.notifications || []);
        setHistoryTotalPages(json.data.pagination?.pages || 1);
      }
    } catch (e) {
      console.error("Error loading history:", e);
      setToast({
        visible: true,
        message: t("admin.pushNotifications.send.loadHistoryError"),
        type: "error",
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      setStatsLoading(true);
      const token = await getToken();

      const subscribersRes = await fetch(
        `${API_BASE_URL}/api/admin/push-notifications/subscribers/count`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const historyRes = await fetch(
        `${API_BASE_URL}/api/admin/push-notifications/history?page=1&limit=100`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (subscribersRes.ok && historyRes.ok) {
        const subscribersJson = await subscribersRes.json();
        const historyJson = await historyRes.json();

        if (subscribersJson.success && historyJson.success) {
          const notifications = historyJson.data?.notifications || [];
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
            (sum: number, n: NotificationHistory) =>
              sum + (n.stats?.failed || 0),
            0
          );

          const successRate =
            totalDelivered + totalFailed > 0
              ? (totalDelivered / (totalDelivered + totalFailed)) * 100
              : 100;

          setStats({
            totalSubscribers: subscribersJson.data?.count || 0,
            notificationsSentToday: todayCount,
            notificationsSentThisWeek: weekCount,
            notificationsSentThisMonth: monthCount,
            averageClickRate: parseFloat(totalClickRate.toFixed(2)),
            deliverySuccessRate: parseFloat(successRate.toFixed(2)),
          });
        }
      }
    } catch (e) {
      console.error("Error loading stats:", e);
      setToast({
        visible: true,
        message: t("admin.pushNotifications.statistics.loadError"),
        type: "error",
      });
    } finally {
      setStatsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!formData.title.trim()) {
      setToast({
        visible: true,
        message: t("admin.pushNotifications.send.titleRequired"),
        type: "error",
      });
      return;
    }

    if (!formData.message.trim()) {
      setToast({
        visible: true,
        message: t("admin.pushNotifications.send.messageRequired"),
        type: "error",
      });
      return;
    }

    if (formData.title.length > 100) {
      setToast({
        visible: true,
        message: t("admin.pushNotifications.send.titleMaxLength"),
        type: "error",
      });
      return;
    }

    if (formData.message.length > 500) {
      setToast({
        visible: true,
        message: t("admin.pushNotifications.send.messageMaxLength"),
        type: "error",
      });
      return;
    }

    if (formData.includeAction) {
      if (!formData.actionUrl.trim()) {
        setToast({
          visible: true,
          message: t("admin.pushNotifications.send.actionUrlRequired"),
          type: "error",
        });
        return;
      }
      if (!formData.actionLabel.trim()) {
        setToast({
          visible: true,
          message: t("admin.pushNotifications.send.buttonLabelRequired"),
          type: "error",
        });
        return;
      }
    }

    if (formData.image && formData.image.trim()) {
      try {
        new URL(formData.image);
      } catch {
        setToast({
          visible: true,
          message: t("admin.pushNotifications.send.imageUrlInvalid"),
          type: "error",
        });
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

      const res = await fetch(
        `${API_BASE_URL}/api/admin/push-notifications/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (json.success) {
        setToast({
          visible: true,
          message: t("admin.pushNotifications.send.sendSuccess", {
            count: json.data?.totalRecipients || 0,
          }),
          type: "success",
        });

        setFormData({
          title: "",
          message: "",
          image: "",
          includeAction: false,
          actionUrl: "",
          actionLabel: "",
        });

        if (activeTab === "history") {
          loadHistory();
        }
      } else {
        setToast({
          visible: true,
          message: json.error || t("admin.pushNotifications.send.sendError"),
          type: "error",
        });
      }
    } catch (e: any) {
      console.error("Error sending notification:", e);
      setToast({
        visible: true,
        message: e.message || t("admin.pushNotifications.send.sendError"),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ 
            paddingTop: headerHeight - 8, 
            paddingBottom: 40,
            flexGrow: 1
          }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "send" && styles.tabActive]}
              onPress={() => setActiveTab("send")}
            >
              <MaterialCommunityIcons
                name="send"
                size={16}
                color={activeTab === "send" ? "#ec4899" : "#9CA3AF"}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === "send" && styles.tabTextActive,
                ]}
              >
                {t("admin.pushNotifications.tabs.send")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "history" && styles.tabActive]}
              onPress={() => setActiveTab("history")}
            >
              <MaterialCommunityIcons
                name="clock"
                size={16}
                color={activeTab === "history" ? "#ec4899" : "#9CA3AF"}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === "history" && styles.tabTextActive,
                ]}
              >
                {t("admin.pushNotifications.tabs.history")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "stats" && styles.tabActive]}
              onPress={() => setActiveTab("stats")}
            >
              <MaterialCommunityIcons
                name="chart-bar"
                size={16}
                color={activeTab === "stats" ? "#ec4899" : "#9CA3AF"}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === "stats" && styles.tabTextActive,
                ]}
              >
                {t("admin.pushNotifications.tabs.statistics")}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Send Tab */}
          {activeTab === "send" && (
            <View style={[styles.card, { flex: 1 }]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {t("admin.pushNotifications.send.title")}
                </Text>
                <Text style={styles.cardDescription}>
                  {t("admin.pushNotifications.send.description")}
                </Text>
              </View>
              <View style={[styles.cardBody, { flex: 1, justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    {t("admin.pushNotifications.send.titleLabel")}{" "}
                    <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={formData.title}
                    onChangeText={(text) =>
                      setFormData({ ...formData, title: text })
                    }
                    placeholder={t(
                      "admin.pushNotifications.send.titlePlaceholder"
                    )}
                    placeholderTextColor="#6B7280"
                    maxLength={100}
                  />
                  <Text style={styles.charCount}>
                    {formData.title.length}/100{" "}
                    {t("admin.pushNotifications.send.characters")}
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    {t("admin.pushNotifications.send.messageLabel")}{" "}
                    <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={formData.message}
                    onChangeText={(text) =>
                      setFormData({ ...formData, message: text })
                    }
                    placeholder={t(
                      "admin.pushNotifications.send.messagePlaceholder"
                    )}
                    placeholderTextColor="#6B7280"
                    multiline
                    numberOfLines={4}
                    maxLength={500}
                  />
                  <Text style={styles.charCount}>
                    {formData.message.length}/500{" "}
                    {t("admin.pushNotifications.send.characters")}
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    {t("admin.pushNotifications.send.imageUrl")}
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={formData.image}
                    onChangeText={(text) =>
                      setFormData({ ...formData, image: text })
                    }
                    placeholder={t(
                      "admin.pushNotifications.send.imageUrlPlaceholder"
                    )}
                    placeholderTextColor="#6B7280"
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {formData.image && (
                    <View style={styles.imagePreview}>
                      <Image
                        source={{ uri: formData.image }}
                        style={styles.previewImage}
                        resizeMode="cover"
                      />
                    </View>
                  )}
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.label}>
                    {t("admin.pushNotifications.send.includeAction")}
                  </Text>
                  <Switch
                    value={formData.includeAction}
                    onValueChange={(value) =>
                      setFormData({ ...formData, includeAction: value })
                    }
                  />
                </View>

                {formData.includeAction && (
                  <View style={styles.actionSection}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>
                        {t("admin.pushNotifications.send.actionUrl")}{" "}
                        <Text style={styles.required}>*</Text>
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={formData.actionUrl}
                        onChangeText={(text) =>
                          setFormData({ ...formData, actionUrl: text })
                        }
                        placeholder={t(
                          "admin.pushNotifications.send.actionUrlPlaceholder"
                        )}
                        placeholderTextColor="#6B7280"
                        keyboardType="url"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>
                        {t("admin.pushNotifications.send.buttonLabel")}{" "}
                        <Text style={styles.required}>*</Text>
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={formData.actionLabel}
                        onChangeText={(text) =>
                          setFormData({ ...formData, actionLabel: text })
                        }
                        placeholder={t(
                          "admin.pushNotifications.send.buttonLabelPlaceholder"
                        )}
                        placeholderTextColor="#6B7280"
                        maxLength={20}
                      />
                    </View>
                  </View>
                )}
                </View>

                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    loading && styles.sendButtonDisabled,
                  ]}
                  onPress={handleSend}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="send" size={16} color="#fff" />
                  )}
                  <Text style={styles.sendButtonText}>
                    {loading
                      ? t("admin.pushNotifications.send.sending")
                      : t("admin.pushNotifications.send.sendToAllUsers")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* History Tab */}
          {activeTab === "history" && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {t("admin.pushNotifications.history.title")}
                </Text>
                <Text style={styles.cardDescription}>
                  {t("admin.pushNotifications.history.description")}
                </Text>
              </View>
              <View style={styles.cardBody}>
                {historyLoading && history.length === 0 ? (
                  <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#ec4899" />
                  </View>
                ) : history.length === 0 ? (
                  <View style={styles.centerContent}>
                    <Text style={styles.emptyText}>
                      {t("admin.pushNotifications.history.empty")}
                    </Text>
                  </View>
                ) : (
                  <>
                    {history.map((notification) => (
                      <TouchableOpacity
                        key={notification.id}
                        style={styles.historyItem}
                        onPress={() => setSelectedNotification(notification)}
                      >
                        <View style={styles.historyItemHeader}>
                          <Text style={styles.historyItemTitle}>
                            {notification.title}
                          </Text>
                          <Text style={styles.historyItemDate}>
                            {new Date(
                              notification.createdAt
                            ).toLocaleDateString()}
                          </Text>
                        </View>
                        <Text
                          style={styles.historyItemMessage}
                          numberOfLines={2}
                        >
                          {notification.message}
                        </Text>
                        <View style={styles.historyItemStats}>
                          <View style={styles.statBadge}>
                            <MaterialCommunityIcons
                              name="check-circle"
                              size={14}
                              color="#22c55e"
                            />
                            <Text style={styles.statText}>
                              {notification.stats.delivered}{" "}
                              {t("admin.pushNotifications.history.delivered")}
                            </Text>
                          </View>
                          <View style={styles.statBadge}>
                            <MaterialCommunityIcons
                              name="eye"
                              size={14}
                              color="#3b82f6"
                            />
                            <Text style={styles.statText}>
                              {notification.stats.clicked}{" "}
                              {t("admin.pushNotifications.history.clicked")}
                            </Text>
                          </View>
                          <Text style={styles.statText}>
                            {notification.stats.clickRate.toFixed(1)}%{" "}
                            {t("admin.pushNotifications.history.clickRate")}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}

                    {historyTotalPages > 1 && (
                      <View style={styles.pagination}>
                        <TouchableOpacity
                          style={[
                            styles.paginationButton,
                            historyPage === 1 &&
                              styles.paginationButtonDisabled,
                          ]}
                          onPress={() =>
                            setHistoryPage((p) => Math.max(1, p - 1))
                          }
                          disabled={historyPage === 1}
                        >
                          <Text style={styles.paginationButtonText}>
                            {t(
                              "admin.pushNotifications.history.pagination.previous"
                            )}
                          </Text>
                        </TouchableOpacity>
                        <Text style={styles.paginationText}>
                          {t(
                            "admin.pushNotifications.history.pagination.pageOf",
                            {
                              current: historyPage,
                              total: historyTotalPages,
                            }
                          )}
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.paginationButton,
                            historyPage === historyTotalPages &&
                              styles.paginationButtonDisabled,
                          ]}
                          onPress={() =>
                            setHistoryPage((p) =>
                              Math.min(historyTotalPages, p + 1)
                            )
                          }
                          disabled={historyPage === historyTotalPages}
                        >
                          <Text style={styles.paginationButtonText}>
                            {t(
                              "admin.pushNotifications.history.pagination.next"
                            )}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          )}

          {/* Stats Tab */}
          {activeTab === "stats" && (
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <Text style={styles.statCardTitle}>
                    {t("admin.pushNotifications.statistics.totalSubscribers")}
                  </Text>
                  <MaterialCommunityIcons name="account-group" size={20} color="#9CA3AF" />
                </View>
                <Text style={styles.statCardValue}>
                  {statsLoading && !stats ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    stats?.totalSubscribers || 0
                  )}
                </Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <Text style={styles.statCardTitle}>
                    {t("admin.pushNotifications.statistics.sentToday")}
                  </Text>
                  <MaterialCommunityIcons
                    name="send"
                    size={20}
                    color="#9CA3AF"
                  />
                </View>
                <Text style={styles.statCardValue}>
                  {statsLoading && !stats ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    stats?.notificationsSentToday || 0
                  )}
                </Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <Text style={styles.statCardTitle}>
                    {t("admin.pushNotifications.statistics.sentThisWeek")}
                  </Text>
                  <MaterialCommunityIcons
                    name="send"
                    size={20}
                    color="#9CA3AF"
                  />
                </View>
                <Text style={styles.statCardValue}>
                  {statsLoading && !stats ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    stats?.notificationsSentThisWeek || 0
                  )}
                </Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <Text style={styles.statCardTitle}>
                    {t("admin.pushNotifications.statistics.sentThisMonth")}
                  </Text>
                  <MaterialCommunityIcons
                    name="send"
                    size={20}
                    color="#9CA3AF"
                  />
                </View>
                <Text style={styles.statCardValue}>
                  {statsLoading && !stats ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    stats?.notificationsSentThisMonth || 0
                  )}
                </Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <Text style={styles.statCardTitle}>
                    {t("admin.pushNotifications.statistics.averageClickRate")}
                  </Text>
                  <MaterialCommunityIcons name="eye" size={20} color="#9CA3AF" />
                </View>
                <Text style={styles.statCardValue}>
                  {statsLoading && !stats ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    `${stats?.averageClickRate || 0}%`
                  )}
                </Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <Text style={styles.statCardTitle}>
                    {t(
                      "admin.pushNotifications.statistics.deliverySuccessRate"
                    )}
                  </Text>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={20}
                    color="#9CA3AF"
                  />
                </View>
                <Text style={styles.statCardValue}>
                  {statsLoading && !stats ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    `${stats?.deliverySuccessRate || 0}%`
                  )}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Notification Details Modal */}
      {selectedNotification && (
        <Modal
          visible={!!selectedNotification}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedNotification(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {t("admin.pushNotifications.details.title")}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedNotification(null)}
                  style={styles.modalCloseButton}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>
                    {t("admin.pushNotifications.details.notificationTitle")}
                  </Text>
                  <Text style={styles.detailValue}>
                    {selectedNotification.title}
                  </Text>
                </View>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>
                    {t("admin.pushNotifications.details.message")}
                  </Text>
                  <Text style={styles.detailValue}>
                    {selectedNotification.message}
                  </Text>
                </View>
                {selectedNotification.image && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>
                      {t("admin.pushNotifications.details.image")}
                    </Text>
                    <Image
                      source={{ uri: selectedNotification.image }}
                      style={styles.detailImage}
                      resizeMode="cover"
                    />
                  </View>
                )}
                <View style={styles.detailGrid}>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailLabel}>
                      {t("admin.pushNotifications.details.totalRecipients")}
                    </Text>
                    <Text style={styles.detailGridValue}>
                      {selectedNotification.totalRecipients}
                    </Text>
                  </View>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailLabel}>
                      {t("admin.pushNotifications.details.sentDate")}
                    </Text>
                    <Text style={styles.detailGridValue}>
                      {new Date(
                        selectedNotification.createdAt
                      ).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailLabel}>
                      {t("admin.pushNotifications.details.delivered")}
                    </Text>
                    <Text
                      style={[styles.detailGridValue, { color: "#22c55e" }]}
                    >
                      {selectedNotification.stats.delivered}
                    </Text>
                  </View>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailLabel}>
                      {t("admin.pushNotifications.details.failed")}
                    </Text>
                    <Text
                      style={[styles.detailGridValue, { color: "#ef4444" }]}
                    >
                      {selectedNotification.stats.failed}
                    </Text>
                  </View>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailLabel}>
                      {t("admin.pushNotifications.details.clicked")}
                    </Text>
                    <Text style={styles.detailGridValue}>
                      {selectedNotification.stats.clicked}
                    </Text>
                  </View>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailLabel}>
                      {t("admin.pushNotifications.details.clickRate")}
                    </Text>
                    <Text style={styles.detailGridValue}>
                      {selectedNotification.stats.clickRate.toFixed(2)}%
                    </Text>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#ec4899",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  tabTextActive: {
    color: "#ec4899",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  card: {
    backgroundColor: "#171717",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    margin: 16,
  },
  cardHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  cardBody: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D1D5DB",
    marginBottom: 8,
  },
  required: {
    color: "#ef4444",
  },
  input: {
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#262626",
    fontSize: 14,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  imagePreview: {
    marginTop: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: 200,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  actionSection: {
    marginTop: 8,
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: "#ec4899",
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    borderRadius: 8,
    padding: 14,
    marginTop: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  centerContent: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  historyItem: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#262626",
  },
  historyItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  historyItemTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
  },
  historyItemDate: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  historyItemMessage: {
    fontSize: 14,
    color: "#D1D5DB",
    marginBottom: 8,
  },
  historyItemStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  statBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    marginTop: 16,
  },
  paginationButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#171717",
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationButtonText: {
    color: "#fff",
    fontSize: 14,
  },
  paginationText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#262626",
  },
  statCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statCardTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  statCardValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  detailSection: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: "#fff",
  },
  detailImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginTop: 8,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  detailGridItem: {
    flex: 1,
    minWidth: "45%",
  },
  detailGridValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginTop: 4,
  },
});
