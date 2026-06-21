import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import ApiService from "@/src/services/apiService";
import { Toast } from "@/components/Toast";
import { getAdminHeaderHeight } from "./_layout";

type AuditLogItem = {
  id: string;
  organizationId: string | null;
  branchId: string | null;
  branchName?: string | null;
  actorUserId: string | null;
  actorClerkId: string | null;
  actorDisplay?: string | null;
  actorUserType: string | null;
  actorOrgRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityDisplay?: string | null;
  before: any;
  after: any;
  metadata: any;
  createdAt: string;
};

type Pagination = {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const formatAuditDateTime = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString(undefined, { month: "short" }).toUpperCase();
  const year = String(d.getFullYear());
  const timePart = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} - ${month} - ${year} ${timePart}`;
};

const formatIfIsoDate = (value: any) => {
  if (typeof value !== "string") return value;
  const s = value.trim();
  if (!ISO_DATE_RE.test(s)) return value;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return value;
  return formatAuditDateTime(s);
};

const actorNameOnly = (value: string) => {
  if (!value) return value;
  const trimmed = value.trim();
  const idx = trimmed.indexOf("<");
  if (idx > 0) return trimmed.slice(0, idx).trim();
  return trimmed;
};

const getActorLabel = (row: Pick<AuditLogItem, "actorDisplay" | "actorUserId" | "actorClerkId">) => {
  const raw = row.actorDisplay || row.actorUserId || row.actorClerkId || "Unknown";
  return actorNameOnly(raw);
};

const getRoleLabel = (row: Pick<AuditLogItem, "actorOrgRole" | "actorUserType">) => {
  return row.actorOrgRole || row.actorUserType || "";
};

const isPlainObject = (v: any) => {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
};

type DiffItem = { path: string; before: any; after: any };

const diffBeforeAfter = (before: any, after: any): DiffItem[] => {
  const diffs: DiffItem[] = [];

  const walk = (b: any, a: any, basePath: string) => {
    if (isPlainObject(b) && isPlainObject(a)) {
      const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
      for (const key of keys) {
        const nextPath = basePath ? `${basePath}.${key}` : key;
        walk(b[key], a[key], nextPath);
      }
      return;
    }

    if (Array.isArray(b) && Array.isArray(a)) {
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        diffs.push({ path: basePath || "(root)", before: b, after: a });
      }
      return;
    }

    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diffs.push({ path: basePath || "(root)", before: b, after: a });
    }
  };

  walk(before, after, "");
  return diffs;
};

const summarizeValue = (v: any) => {
  if (v === null) return "null";
  if (v === undefined) return "";
  if (typeof v === "string") return String(formatIfIsoDate(v));
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, (_, value) => formatIfIsoDate(value));
  } catch {
    return String(v);
  }
};

const prettyJson = (value: any) => {
  try {
    return JSON.stringify(value, (_, v) => formatIfIsoDate(v), 2);
  } catch {
    return String(value);
  }
};

const ACTION_OPTIONS = [
  "MEAL_CREATE",
  "MEAL_UPDATE",
  "MEAL_DELETE",
  "CATEGORY_CREATE",
  "CATEGORY_UPDATE",
  "CATEGORY_DELETE",
  "ADDON_CREATE",
  "ADDON_UPDATE",
  "ADDON_DELETE",
  "ORDER_CREATE",
  "ORDER_UPDATE",
  "SETTINGS_UPDATE",
  "BRANCH_UPDATE",
  "ORG_UPDATE",
  "HEROSECTION_UPDATE",
  "HEROSECTION_UPSERT",
];

export default function AuditLogsScreen() {
  const { t } = useTranslation();
  const { getToken } = useAuthRole();
  const { rbacUser } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + getAdminHeaderHeight();

  const viewerOrgRole = (rbacUser as any)?.orgRole as string | null | undefined;
  const viewerUserType = (rbacUser as any)?.userType as string | null | undefined;

  const canView =
    viewerUserType === "SUPER_ADMIN" ||
    viewerOrgRole === "ORG_OWNER" ||
    viewerOrgRole === "ORG_ADMIN";

  const canViewMetadata = viewerUserType === "SUPER_ADMIN";

  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [action, setAction] = useState<string>("");
  const [createdAfter, setCreatedAfter] = useState<Date | undefined>(undefined);
  const [createdBefore, setCreatedBefore] = useState<Date | undefined>(undefined);

  const [showActionPicker, setShowActionPicker] = useState(false);
  const [showLimitPicker, setShowLimitPicker] = useState(false);

  const [showCreatedAfterPicker, setShowCreatedAfterPicker] = useState(false);
  const [showCreatedBeforePicker, setShowCreatedBeforePicker] = useState(false);

  const [selected, setSelected] = useState<AuditLogItem | null>(null);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (action) params.set("action", action);
    if (createdAfter) params.set("createdAfter", createdAfter.toISOString());
    if (createdBefore) params.set("createdBefore", createdBefore.toISOString());
    return params.toString();
  }, [action, createdAfter, createdBefore, limit, page]);

  const load = useCallback(
    async (opts?: { isRefresh?: boolean }) => {
      if (!canView) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (organizationLoading) return;
      if (!selectedOrganizationId) {
        setItems([]);
        setPagination(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (!opts?.isRefresh) setLoading(true);
        const token = (await getToken()) || undefined;
        if (!token) return;

        const api = ApiService.getInstance();
        const query = buildQuery();
        const response = await api.get(
          `/api/audit-logs${query ? `?${query}` : ""}`,
          token,
          {
            headers: {
              "x-organization-id": selectedOrganizationId,
            },
          }
        );
        const payload = (response as any)?.data?.data ?? (response as any)?.data ?? {};
        const nextItems = (payload?.items || []) as AuditLogItem[];
        const nextPagination = (payload?.pagination || null) as Pagination | null;

        if (!isMountedRef.current) return;
        setItems(nextItems);
        setPagination(nextPagination);
      } catch (e: any) {
        console.error("Load audit logs error:", {
          message: e?.message,
          status: e?.status,
          data: e?.data,
          url: e?.url,
          method: e?.method,
          raw: e,
        });
        if (!isMountedRef.current) return;
        setToast({
          visible: true,
          message: e?.message || t("admin.auditLogs.errors.load"),
          type: "error",
        });
      } finally {
        if (!isMountedRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildQuery, canView, getToken, organizationLoading, selectedOrganizationId, t]
  );

  useEffect(() => {
    if (organizationLoading) return;

    setItems([]);
    setPagination(null);
    setPage(1);

    load();
  }, [selectedOrganizationId, organizationLoading, load]);

  useEffect(() => {
    load();
  }, [page, limit, action, createdAfter, createdBefore, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load({ isRefresh: true });
  };

  const listEmpty = !loading && items.length === 0;

  if (!canView) {
    return (
      <View style={styles.deniedContainer}>
        <Text style={styles.deniedTitle}>{t("admin.auditLogs.title")}</Text>
        <Text style={styles.deniedText}>{t("common.accessDenied")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#f3f4f6"
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topRow}>
          <Text style={styles.pageTitle}>{t("admin.auditLogs.title")}</Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => load({ isRefresh: true })}
            disabled={loading}
          >
            <MaterialCommunityIcons
              name={loading ? "loading" : "refresh"}
              size={16}
              color="#F472B6"
            />
            <Text style={styles.refreshBtnText}>{t("common.refresh")}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filtersCard}>
          <Text style={styles.filtersTitle}>{t("common.filter")}</Text>

          <View style={styles.filtersGrid}>
            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>{t("admin.auditLogs.filters.action")}</Text>
              <TouchableOpacity
                style={styles.filterInput}
                onPress={() => setShowActionPicker(true)}
              >
                <Text style={styles.filterValue} numberOfLines={1}>
                  {action || t("common.all")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>{t("admin.auditLogs.filters.createdAfter")}</Text>
              <TouchableOpacity
                style={styles.filterInput}
                onPress={() => setShowCreatedAfterPicker(true)}
              >
                <Text style={styles.filterValue} numberOfLines={1}>
                  {createdAfter ? formatAuditDateTime(createdAfter.toISOString()) : t("admin.auditLogs.filters.selectDateTime")}
                </Text>
                <MaterialCommunityIcons name="calendar" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>{t("admin.auditLogs.filters.createdBefore")}</Text>
              <TouchableOpacity
                style={styles.filterInput}
                onPress={() => setShowCreatedBeforePicker(true)}
              >
                <Text style={styles.filterValue} numberOfLines={1}>
                  {createdBefore ? formatAuditDateTime(createdBefore.toISOString()) : t("admin.auditLogs.filters.selectDateTime")}
                </Text>
                <MaterialCommunityIcons name="calendar" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>{t("admin.auditLogs.filters.pageSize")}</Text>
              <TouchableOpacity
                style={styles.filterInput}
                onPress={() => setShowLimitPicker(true)}
              >
                <Text style={styles.filterValue} numberOfLines={1}>
                  {String(limit)}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.filtersActionsRow}>
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                setAction("");
                setCreatedAfter(undefined);
                setCreatedBefore(undefined);
                setPage(1);
              }}
            >
              <Text style={styles.clearBtnText}>{t("common.clear")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.countText}>
          {pagination
            ? t("admin.auditLogs.totalCount", { count: pagination.totalCount })
            : ""}
        </Text>

        {loading ? (
          <View style={styles.loadingInline}>
            <ActivityIndicator size="small" color="#ec4899" />
            <Text style={styles.loadingInlineText}>{t("common.loading")}</Text>
          </View>
        ) : null}

        {listEmpty ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{t("admin.auditLogs.empty")}</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {items.map((row) => {
              const actorLabel = getActorLabel(row);
              const roleLabel = getRoleLabel(row);
              const entityLabel =
                row.entityDisplay ||
                (row.entityType
                  ? `${row.entityType}${row.entityId ? `:${row.entityId}` : ""}`
                  : row.entityId || "");
              const branchLabel =
                row.branchName || row.branchId || t("admin.auditLogs.orgLevel");

              return (
                <TouchableOpacity
                  key={row.id}
                  style={styles.row}
                  onPress={() => setSelected(row)}
                >
                  <View style={styles.rowTop}>
                    <View style={styles.rowTopLeft}>
                      <Text style={styles.rowAction} numberOfLines={1}>
                        {row.action}
                      </Text>
                      <Text style={styles.rowEntity} numberOfLines={1}>
                        {entityLabel}
                      </Text>
                    </View>
                    <Text style={styles.rowTime}>
                      {row.createdAt ? formatAuditDateTime(row.createdAt) : ""}
                    </Text>
                  </View>

                  <View style={styles.rowMetaGrid}>
                    <View style={styles.rowMetaCol}>
                      <Text style={styles.rowMetaLabel}>
                        {t("admin.auditLogs.columns.actor")}
                      </Text>
                      <Text style={styles.rowMetaValue} numberOfLines={1}>
                        {actorLabel}
                      </Text>
                    </View>
                    <View style={styles.rowMetaCol}>
                      <Text style={styles.rowMetaLabel}>
                        {t("admin.auditLogs.columns.role")}
                      </Text>
                      <Text style={styles.rowMetaValue} numberOfLines={1}>
                        {roleLabel}
                      </Text>
                    </View>
                    <View style={[styles.rowMetaCol, { width: "100%" }]}
                    >
                      <Text style={styles.rowMetaLabel}>
                        {t("admin.auditLogs.columns.branch")}
                      </Text>
                      <Text style={styles.rowMetaValue} numberOfLines={1}>
                        {branchLabel}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.paginationRow}>
          <TouchableOpacity
            style={[styles.pageBtn, (!pagination?.hasPrev || loading) && styles.pageBtnDisabled]}
            disabled={!pagination?.hasPrev || loading}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
          >
            <Text style={styles.pageBtnText}>{t("common.previous")}</Text>
          </TouchableOpacity>

          <Text style={styles.pageInfo}>
            {pagination
              ? t("admin.auditLogs.pagination", {
                  current: pagination.currentPage,
                  total: pagination.totalPages,
                })
              : ""}
          </Text>

          <TouchableOpacity
            style={[styles.pageBtn, (!pagination?.hasNext || loading) && styles.pageBtnDisabled]}
            disabled={!pagination?.hasNext || loading}
            onPress={() => setPage((p) => p + 1)}
          >
            <Text style={styles.pageBtnText}>{t("common.next")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        topOffset={headerHeight + 8}
        onHide={() => setToast((p) => ({ ...p, visible: false }))}
      />

      {/* Pickers */}
      <Modal
        visible={showActionPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionPicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowActionPicker(false)}>
          <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>{t("admin.auditLogs.filters.action")}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              <TouchableOpacity
                style={styles.pickerItem}
                onPress={() => {
                  setPage(1);
                  setAction("");
                  setShowActionPicker(false);
                }}
              >
                <Text style={styles.pickerItemText}>{t("common.all")}</Text>
              </TouchableOpacity>
              {ACTION_OPTIONS.map((a) => (
                <TouchableOpacity
                  key={a}
                  style={styles.pickerItem}
                  onPress={() => {
                    setPage(1);
                    setAction(a);
                    setShowActionPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{a}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showLimitPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLimitPicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowLimitPicker(false)}>
          <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>{t("admin.auditLogs.filters.pageSize")}</Text>
            {[25, 50, 100, 200].map((n) => (
              <TouchableOpacity
                key={n}
                style={styles.pickerItem}
                onPress={() => {
                  setPage(1);
                  setLimit(n);
                  setShowLimitPicker(false);
                }}
              >
                <Text style={styles.pickerItemText}>{String(n)}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Date pickers */}
      {showCreatedAfterPicker ? (
        <DateTimePicker
          value={createdAfter || new Date()}
          mode="datetime"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, d) => {
            setShowCreatedAfterPicker(false);
            if (d) {
              setPage(1);
              setCreatedAfter(d);
            }
          }}
        />
      ) : null}

      {showCreatedBeforePicker ? (
        <DateTimePicker
          value={createdBefore || new Date()}
          mode="datetime"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, d) => {
            setShowCreatedBeforePicker(false);
            if (d) {
              setPage(1);
              setCreatedBefore(d);
            }
          }}
        />
      ) : null}

      {/* Details */}
      <Modal
        visible={Boolean(selected)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          <View style={[styles.sheetContainer, { marginBottom: insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetHeaderTitle}>{t("admin.auditLogs.details.title")}</Text>
              <TouchableOpacity style={styles.sheetCloseInline} onPress={() => setSelected(null)}>
                <MaterialCommunityIcons name="close" size={18} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {selected ? (
                <View style={styles.detailsBody}>
                  <View style={styles.detailsCard}>
                    <View style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>{t("admin.auditLogs.fields.time")}</Text>
                      <Text style={styles.detailsValue}>
                        {selected.createdAt ? formatAuditDateTime(selected.createdAt) : ""}
                      </Text>
                    </View>
                    <View style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>{t("admin.auditLogs.fields.actor")}</Text>
                      <Text style={styles.detailsValue}>
                        {getActorLabel(selected)}
                        {getRoleLabel(selected) ? ` (${getRoleLabel(selected)})` : ""}
                      </Text>
                    </View>
                    <View style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>{t("admin.auditLogs.fields.action")}</Text>
                      <Text style={[styles.detailsValue, { fontWeight: "700" }]}>
                        {selected.action}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailsCard}>
                    <Text style={styles.sectionTitle}>{t("admin.auditLogs.details.changes")}</Text>
                    {diffBeforeAfter(selected.before, selected.after).length === 0 ? (
                      <Text style={styles.muted}>{t("admin.auditLogs.details.noChanges")}</Text>
                    ) : (
                      <View style={styles.diffBox}>
                        {diffBeforeAfter(selected.before, selected.after).map((d) => (
                          <View key={d.path} style={styles.diffRow}>
                            <Text style={styles.diffPath}>{d.path}</Text>
                            <Text style={styles.diffBefore}>{summarizeValue(d.before)}</Text>
                            <Text style={styles.diffAfter}>{summarizeValue(d.after)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  <View style={styles.detailsCard}>
                    <Text style={styles.sectionTitle}>{t("admin.auditLogs.details.before")}</Text>
                    <Text style={styles.codeBlock}>{prettyJson(selected.before)}</Text>
                  </View>

                  <View style={styles.detailsCard}>
                    <Text style={styles.sectionTitle}>{t("admin.auditLogs.details.after")}</Text>
                    <Text style={styles.codeBlock}>{prettyJson(selected.after)}</Text>
                  </View>

                  {canViewMetadata ? (
                    <View style={styles.detailsCard}>
                      <Text style={styles.sectionTitle}>{t("admin.auditLogs.details.metadata")}</Text>
                      <Text style={styles.codeBlock}>{prettyJson(selected.metadata)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  deniedContainer: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  deniedTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  deniedText: {
    color: "#6b7280",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 12,
  },
  pageTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(236, 72, 153, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.18)",
  },
  refreshBtnText: {
    color: "#F472B6",
    fontWeight: "700",
  },
  filtersCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  filtersTitle: {
    color: "#111827",
    fontWeight: "800",
    marginBottom: 10,
  },
  filtersGrid: {
    gap: 10,
  },
  filterBlock: {
    gap: 6,
  },
  filterLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
  },
  filterInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterValue: {
    color: "#111827",
    flex: 1,
    paddingRight: 10,
  },
  filtersActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  clearBtnText: {
    color: "#111827",
    fontWeight: "700",
  },
  countText: {
    color: "#6b7280",
    marginBottom: 10,
  },
  loadingInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  loadingInlineText: {
    color: "#6b7280",
  },
  emptyBox: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    padding: 16,
  },
  emptyText: {
    color: "#6b7280",
  },
  listCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  rowTop: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  rowTopLeft: {
    flex: 1,
    gap: 2,
  },
  rowAction: {
    color: "#111827",
    fontWeight: "800",
  },
  rowEntity: {
    color: "#6b7280",
    fontSize: 12,
  },
  rowTime: {
    color: "#6b7280",
    fontSize: 12,
  },
  rowMetaGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  rowMetaCol: {
    minWidth: 120,
    flex: 1,
    gap: 2,
  },
  rowMetaLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
  },
  rowMetaValue: {
    color: "#4b5563",
    fontSize: 12,
  },
  paginationRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  pageBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    minWidth: 110,
    alignItems: "center",
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    color: "#111827",
    fontWeight: "800",
  },
  pageInfo: {
    color: "#6b7280",
    textAlign: "center",
    flex: 1,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: 18,
  },
  pickerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
  },
  pickerTitle: {
    color: "#111827",
    fontWeight: "800",
    marginBottom: 10,
  },
  pickerItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  pickerItemText: {
    color: "#111827",
    fontWeight: "700",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    maxHeight: "85%",
  },
  sheetHandle: {
    width: 50,
    height: 5,
    borderRadius: 99,
    backgroundColor: "#e5e7eb",
    alignSelf: "center",
    marginVertical: 10,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  sheetHeaderTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  sheetCloseInline: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetScroll: {
    maxHeight: 620,
  },
  detailsBody: {
    padding: 16,
    gap: 12,
  },
  detailsCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  detailsRow: {
    gap: 4,
  },
  detailsLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700",
  },
  detailsValue: {
    color: "#111827",
  },
  sectionTitle: {
    color: "#111827",
    fontWeight: "800",
  },
  muted: {
    color: "#6b7280",
  },
  diffBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    overflow: "hidden",
  },
  diffRow: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 4,
  },
  diffPath: {
    color: "#4b5563",
    fontWeight: "800",
    fontSize: 12,
  },
  diffBefore: {
    color: "#6b7280",
    fontSize: 12,
  },
  diffAfter: {
    color: "#111827",
    fontSize: 12,
  },
  codeBlock: {
    color: "#4b5563",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 11,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 10,
  },
});
