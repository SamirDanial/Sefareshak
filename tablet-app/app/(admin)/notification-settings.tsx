import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import ApiService from "@/src/services/apiService";
import { useRouter } from "expo-router";
import pushNotificationService from "@/src/services/pushNotificationService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

interface NotificationPreference {
  id: string;
  userId: string;
  organizationId: string | null;
  branchId: string | null;
  enabled: boolean;
  organization?: {
    id: string;
    name: string;
  };
  branch?: {
    id: string;
    name: string;
  };
}

export default function NotificationSettingsScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const apiService = ApiService.getInstance();
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [sendingTestNotification, setSendingTestNotification] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const response = await apiService.getNotificationPreferences(token);
      if (response.success) {
        setPreferences(response.data || []);
      }
    } catch (error) {
      console.error("Failed to load notification preferences:", error);
      Alert.alert("Error", "Failed to load notification preferences");
    } finally {
      setLoading(false);
    }
  };

  const togglePreference = async (preference: NotificationPreference) => {
    setUpdating(preference.id);
    try {
      const token = await getToken();
      if (!token) return;

      const data: any = {
        enabled: !preference.enabled,
      };

      if (preference.organizationId) {
        data.organizationId = preference.organizationId;
      }
      if (preference.branchId) {
        data.branchId = preference.branchId;
      }

      const response = await apiService.setNotificationPreference(token, data);

      if (response.success) {
        setPreferences((prev) =>
          prev.map((p) =>
            p.id === preference.id ? { ...p, enabled: !p.enabled } : p
          )
        );
      } else {
        Alert.alert("Error", response.error || "Failed to update preference");
      }
    } catch (error) {
      console.error("Failed to toggle preference:", error);
      Alert.alert("Error", "Failed to update notification preference");
    } finally {
      setUpdating(null);
    }
  };

  const deletePreference = async (preference: NotificationPreference) => {
    Alert.alert(
      "Delete Preference",
      "Are you sure you want to delete this notification preference?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getToken();
              if (!token) return;

              const response = await apiService.deleteNotificationPreference(
                token,
                preference.id
              );

              if (response.success) {
                setPreferences((prev) =>
                  prev.filter((p) => p.id !== preference.id)
                );
              } else {
                Alert.alert("Error", response.error || "Failed to delete preference");
              }
            } catch (error) {
              console.error("Failed to delete preference:", error);
              Alert.alert("Error", "Failed to delete notification preference");
            }
          },
        },
      ]
    );
  };

  const getPreferenceLabel = (preference: NotificationPreference) => {
    if (preference.organization) {
      return `All branches (${preference.organization.name})`;
    }
    if (preference.branch) {
      return preference.branch.name;
    }
    return "Unknown";
  };

  const requestNotificationPermission = async () => {
    setRequestingPermission(true);
    try {
      const granted = await pushNotificationService.getInstance().requestPermission();
      if (granted) {
        Alert.alert(
          "Permission Granted",
          "Push notifications are now enabled. You can register for push notifications to receive updates.",
          [
            {
              text: "Register Now",
              onPress: async () => {
                try {
                  const token = await getToken();
                  const organizationId = await AsyncStorage.getItem("nf:selectedOrganizationId");
                  if (token) {
                    await pushNotificationService.getInstance().registerForPushNotifications(token, organizationId || undefined);
                    Alert.alert("Success", "Push notifications registered successfully!");
                  }
                } catch (error) {
                  Alert.alert("Error", "Failed to register for push notifications");
                }
              },
            },
            { text: "Later", style: "cancel" },
          ]
        );
      } else {
        Alert.alert(
          "Permission Denied",
          "Push notification permission was denied. You can enable it in system settings if you change your mind."
        );
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      Alert.alert("Error", "Failed to request notification permission");
    } finally {
      setRequestingPermission(false);
    }
  };

  const sendTestNotification = async () => {
    setSendingTestNotification(true);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Test Notification",
          body: "Push notifications are working correctly!",
          sound: "default",
        },
        trigger: null,
      });
      Alert.alert("Success", "Test notification sent! Check your status bar.");
    } catch (error) {
      console.error("Error sending test notification:", error);
      Alert.alert("Error", "Failed to send test notification");
    } finally {
      setSendingTestNotification(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f5" }}>
      {/* Header */}
      <View style={{ backgroundColor: "#fff", padding: 16, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
            <Text style={{ fontSize: 24 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: "bold" }}>Notification Settings</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Permission Request Button */}
        <View style={{
          backgroundColor: "#fff",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 2,
          elevation: 2,
        }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
            Push Notification Permission
          </Text>
          <Text style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
            Enable push notifications to receive updates about orders, reservations, and other important events.
          </Text>
          <TouchableOpacity
            onPress={requestNotificationPermission}
            disabled={requestingPermission}
            style={{
              backgroundColor: "#ec4899",
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            {requestingPermission ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>
                Request Permission
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Test Notification Button */}
        <View style={{
          backgroundColor: "#fff",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 2,
          elevation: 2,
        }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
            Test Notification
          </Text>
          <Text style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
            Send a test notification to verify that push notifications are working on your device.
          </Text>
          <TouchableOpacity
            onPress={sendTestNotification}
            disabled={sendingTestNotification}
            style={{
              backgroundColor: "#10b981",
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            {sendingTestNotification ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>
                Send Test Notification
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {preferences.length === 0 ? (
          <View style={{ padding: 20, alignItems: "center" }}>
            <Text style={{ color: "#666", textAlign: "center" }}>
              No notification preferences set. Preferences will be auto-created based on your role when you log in.
            </Text>
          </View>
        ) : (
          preferences.map((preference) => (
            <View
              key={preference.id}
              style={{
                backgroundColor: "#fff",
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
                elevation: 2,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "500" }}>
                  {getPreferenceLabel(preference)}
                </Text>
                <Text style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  {preference.organizationId
                    ? "Receive notifications for all branches in organization"
                    : "Receive notifications for this specific branch"}
                </Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {updating === preference.id ? (
                  <ActivityIndicator size="small" style={{ marginRight: 12 }} />
                ) : (
                  <Switch
                    value={preference.enabled}
                    onValueChange={() => togglePreference(preference)}
                    style={{ marginRight: 12 }}
                  />
                )}

                <TouchableOpacity onPress={() => deletePreference(preference)}>
                  <Text style={{ color: "#ff3b30", fontSize: 14 }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={{ marginTop: 20, padding: 16, backgroundColor: "#fff", borderRadius: 8 }}>
          <Text style={{ fontSize: 14, color: "#666", lineHeight: 20 }}>
            <Text style={{ fontWeight: "bold" }}>About Notifications:</Text>
            {"\n\n"}
            • Organization owners/admins receive notifications for all branches in their organization
            {"\n"}
            • Employees receive notifications only for branches they are assigned to
            {"\n"}
            • Toggle notifications on/off for specific branches or organizations
            {"\n"}
            • Delete preferences to stop receiving notifications for specific locations
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
