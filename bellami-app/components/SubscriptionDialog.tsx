import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface SubscriptionDialogProps {
  visible: boolean;
  onClose: () => void;
  onLogin: () => void;
}

const SubscriptionDialog: React.FC<SubscriptionDialogProps> = ({
  visible,
  onClose,
  onLogin,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.container}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>
              {t("home.subscription.loginRequiredTitle")}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            <Text style={styles.message}>
              {t("home.subscription.loginRequiredMsg")}
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>
                {t("common.cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.loginButton} onPress={onLogin}>
              <Text style={styles.loginButtonText}>
                {t("common.login")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    backgroundColor: "#171717",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#262626",
    width: "100%",
    maxWidth: 400,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#404040",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "#262626",
  },
  content: {
    padding: 20,
  },
  message: {
    color: "#D1D5DB",
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#262626",
  },
  cancelButtonText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "600",
  },
  loginButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default SubscriptionDialog;
