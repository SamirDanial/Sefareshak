import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/src/contexts/LanguageContext";

const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "es", name: "Español", flag: "🇪🇸" },
];

interface LanguageSwitcherProps {
  showLabel?: boolean; // Show language name alongside flag
}

export default function LanguageSwitcher({ showLabel = false }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const { changeLanguage: changeLanguageContext } = useLanguage();
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);

  const changeLanguage = async (langCode: string) => {
    try {
      // Change language using context - this will trigger re-renders globally
      await changeLanguageContext(langCode);
      // Then save to storage
      await AsyncStorage.setItem("userLanguage", langCode);
      setShowModal(false);
    } catch (error) {
      console.error("Error changing language:", error);
    }
  };

  const currentLanguage = languages.find((lang) => lang.code === i18n.language);

  return (
    <>
      <TouchableOpacity
        style={[styles.languageButton, showLabel && styles.languageButtonWithLabel]}
        onPress={() => setShowModal(true)}
        accessibilityLabel="Change language"
      >
        <Text style={styles.flag}>{currentLanguage?.flag || "🌐"}</Text>
        {showLabel && currentLanguage && (
          <Text style={styles.languageName}>{currentLanguage.name}</Text>
        )}
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.bottomSheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowModal(false)}
          />
          <View style={[styles.bottomSheetContent, { paddingBottom: Math.max(12, insets.bottom + 12) }]}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>Select Language</Text>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.bottomSheetBody}>
              {languages.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.bottomSheetOption,
                    i18n.language === lang.code &&
                      styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => changeLanguage(lang.code)}
                >
                  <Text style={styles.languageFlag}>{lang.flag}</Text>
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      i18n.language === lang.code &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {lang.name}
                  </Text>
                  {i18n.language === lang.code && (
                    <MaterialIcons
                      name="check"
                      size={20}
                      color="#ec4899"
                      style={styles.checkIcon}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  languageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  languageButtonWithLabel: {
    width: "auto",
    minWidth: 100,
    height: "auto",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  flag: {
    fontSize: 18,
  },
  languageName: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
    marginLeft: 8,
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#d1d5db",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  closeButton: {
    padding: 4,
  },
  bottomSheetBody: {
    padding: 8,
    maxHeight: 400,
  },
  bottomSheetOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  bottomSheetOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  languageFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  bottomSheetOptionText: {
    flex: 1,
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
  checkIcon: {
    marginLeft: 8,
  },
});
