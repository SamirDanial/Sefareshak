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

import { useAuthRole } from "@/src/contexts/AuthContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import branchService, { type Organization } from "@/src/services/branchService";

type Props = {
  variant?: "compact" | "title";
};

const truncateLabel = (value: string, maxChars: number): string => {
  const s = (value || "").trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}...`;
};

export function OrganizationSwitcher({ variant = "compact" }: Props) {
  const { t } = useTranslation();
  const { userType, getToken } = useAuthRole();
  const { selectedOrganizationId, setSelectedOrganizationId } = useOrganization();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const isSuperAdmin = userType === "SUPER_ADMIN";

  useEffect(() => {
    const load = async () => {
      if (!isSuperAdmin) return;
      try {
        setLoading(true);
        const token = await getToken();
        if (!token) return;
        const orgs = await branchService.getOrganizations(token);
        setOrganizations(Array.isArray(orgs) ? orgs : []);
      } catch {
        setOrganizations([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [getToken, isSuperAdmin]);

  const selectedOrgName = useMemo(() => {
    if (!selectedOrganizationId) return "";
    return organizations.find((o) => o.id === selectedOrganizationId)?.name || "";
  }, [organizations, selectedOrganizationId]);

  const selectedLabelRaw = selectedOrganizationId
    ? selectedOrgName || selectedOrganizationId
    : (t("admin.selectOrganization", { defaultValue: "Select organization" }) as any);

  const selectedLabel = truncateLabel(String(selectedLabelRaw || ""), 15);

  const filteredOrganizations = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter((o) => {
      const name = String(o.name || "").toLowerCase();
      const id = String(o.id || "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [organizations, search]);

  if (!isSuperAdmin) return null;

  return (
    <>
      <TouchableOpacity
        style={[styles.button, variant === "title" && styles.buttonTitle]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
      >
        <View style={styles.buttonLeft}>
          <Text
            style={[styles.buttonText, variant === "title" && styles.buttonTextTitle]}
            numberOfLines={1}
          >
            {selectedLabel}
          </Text>
        </View>
        <View style={styles.buttonRight}>
          {loading ? (
            <ActivityIndicator size="small" color={variant === "title" ? "#fff" : "#ec4899"} />
          ) : (
            <MaterialCommunityIcons
              name="chevron-down"
              size={variant === "title" ? 16 : 14}
              color={variant === "title" ? "#fff" : "#9CA3AF"}
            />
          )}
        </View>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("admin.selectOrganization", { defaultValue: "Select organization" })}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color="#9CA3AF" />
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
                  <MaterialCommunityIcons name="close-circle" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView style={styles.modalBody}>
              {filteredOrganizations.map((org) => {
                const isSelected = org.id === selectedOrganizationId;
                return (
                  <TouchableOpacity
                    key={org.id}
                    style={[styles.option, isSelected && styles.optionActive]}
                    onPress={async () => {
                      await setSelectedOrganizationId(org.id);
                      setOpen(false);
                    }}
                  >
                    <Text
                      style={[styles.optionText, isSelected && styles.optionTextActive]}
                      numberOfLines={1}
                    >
                      {org.name || org.id}
                    </Text>
                    {isSelected ? (
                      <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}

              {filteredOrganizations.length === 0 && !loading ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>
                    {t("common.noResults", { defaultValue: "No results" })}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.25)",
    backgroundColor: "rgba(236, 72, 153, 0.08)",
    minWidth: 140,
    maxWidth: 180,
    flexShrink: 0,
    gap: 8,
  },
  buttonTitle: {
    height: 38,
    borderRadius: 14,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    minWidth: 180,
    maxWidth: 220,
  },
  buttonLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  buttonText: {
    color: "#ec4899",
    fontSize: 12,
    flex: 1,
    minWidth: 0,
  },
  buttonTextTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  buttonRight: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#111111",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingBottom: 16,
    maxHeight: "70%",
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  modalBody: {
    paddingHorizontal: 12,
  },
  searchWrap: {
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: "#fff",
    fontSize: 14,
  },
  searchClear: {
    padding: 2,
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
    color: "#e5e7eb",
    fontSize: 14,
    flex: 1,
    marginRight: 10,
  },
  optionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  emptyWrap: {
    paddingVertical: 18,
    alignItems: "center",
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 13,
  },
});
