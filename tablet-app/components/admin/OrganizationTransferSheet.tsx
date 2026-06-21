import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import branchService, { type Organization } from "@/src/services/branchService";

type Props = {
  visible: boolean;
  onClose: () => void;
  getToken: () => Promise<string | null>;
  mode: "move" | "copy";
  selectedCount: number;
  onConfirm: (organizationId: string) => Promise<void>;
  confirming?: boolean;
};

export function OrganizationTransferSheet({
  visible,
  onClose,
  getToken,
  mode,
  selectedCount,
  onConfirm,
  confirming = false,
}: Props) {
  const { t } = useTranslation();
  const [organizations, setOrganizations] = useState<Organization[]>(() =>
    branchService.getCachedOrganizations()
  );
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [targetOrganizationId, setTargetOrganizationId] = useState("");

  useEffect(() => {
    if (!visible) return;

    setSearch("");
    setTargetOrganizationId("");

    const load = async () => {
      try {
        const cached = branchService.getCachedOrganizations();
        if (cached.length > 0) {
          setOrganizations(cached);
        }

        setLoading(true);
        const token = await getToken();
        if (!token) return;
        let orgs: Organization[] = cached;
        if (cached.length > 0) {
          void branchService.prefetchOrganizations(token);
        } else {
          orgs = await branchService.getOrganizations(token);
        }
        setOrganizations(Array.isArray(orgs) ? orgs : []);
      } catch {
        setOrganizations([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [getToken, visible]);

  const filteredOrganizations = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter((o) => {
      const name = String(o.name || "").toLowerCase();
      const id = String(o.id || "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [organizations, search]);

  const title =
    mode === "move"
      ? t("common.move", { defaultValue: "Move" })
      : t("common.copy", { defaultValue: "Copy" });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subTitle} numberOfLines={1}>
            {t("common.selected", { defaultValue: "Selected" })}: {selectedCount}
          </Text>

          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={18} color="#6b7280" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("common.search", { defaultValue: "Search" }) as any}
              placeholderTextColor="#6b7280"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.trim().length > 0 ? (
              <TouchableOpacity onPress={() => setSearch("")} style={styles.searchClear}>
                <MaterialCommunityIcons name="close-circle" size={18} color="#6b7280" />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#ec4899" />
              </View>
            ) : filteredOrganizations.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>
                  {t("common.noResults", { defaultValue: "No results" })}
                </Text>
              </View>
            ) : (
              filteredOrganizations.map((org) => {
                const isSelected = org.id === targetOrganizationId;
                return (
                  <TouchableOpacity
                    key={org.id}
                    style={[styles.option, isSelected && styles.optionActive]}
                    onPress={() => setTargetOrganizationId(org.id)}
                  >
                    <Text
                      style={[styles.optionText, isSelected && styles.optionTextActive]}
                      numberOfLines={1}
                    >
                      {org.name || org.id}
                    </Text>
                    {isSelected ? (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color="#ec4899"
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.footerButton, styles.footerButtonCancel]}
              onPress={onClose}
              disabled={confirming}
            >
              <Text style={styles.footerButtonCancelText}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.footerButton,
                styles.footerButtonConfirm,
                (!targetOrganizationId || confirming) && styles.footerButtonDisabled,
              ]}
              onPress={async () => {
                if (!targetOrganizationId) return;
                await onConfirm(targetOrganizationId);
              }}
              disabled={!targetOrganizationId || confirming}
            >
              <Text style={styles.footerButtonConfirmText}>
                {confirming
                  ? t("common.loading", { defaultValue: "Loading" })
                  : t("common.save", { defaultValue: "Save" })}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingBottom: 16,
    width: "100%",
    maxWidth: 520,
    maxHeight: "75%",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  subTitle: {
    color: "#6b7280",
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchWrap: {
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: "#111827",
    fontSize: 14,
  },
  searchClear: {
    padding: 2,
  },
  body: {
    paddingHorizontal: 12,
  },
  loadingWrap: {
    paddingVertical: 16,
    alignItems: "center",
  },
  emptyWrap: {
    paddingVertical: 18,
    alignItems: "center",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 13,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.25)",
  },
  optionText: {
    color: "#4b5563",
    fontSize: 14,
    flex: 1,
    marginRight: 10,
  },
  optionTextActive: {
    color: "#111827",
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  footerButton: {
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  footerButtonCancel: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "transparent",
  },
  footerButtonCancelText: {
    color: "#4b5563",
    fontSize: 14,
    fontWeight: "600",
  },
  footerButtonConfirm: {
    backgroundColor: "#ec4899",
  },
  footerButtonDisabled: {
    opacity: 0.5,
  },
  footerButtonConfirmText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
