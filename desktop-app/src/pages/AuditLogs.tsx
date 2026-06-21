import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import ApiService from "@/services/apiService";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import PageHeader from "@/components/PageHeader";
import { toast } from "@/components/Toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

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

const getActorLabel = (
  row: Pick<AuditLogItem, "actorDisplay" | "actorUserId" | "actorClerkId">
) => {
  const raw = row.actorDisplay || row.actorUserId || row.actorClerkId || "Unknown";
  return actorNameOnly(raw);
};

const getRoleLabel = (
  row: Pick<AuditLogItem, "actorOrgRole" | "actorUserType">
) => {
  return row.actorOrgRole || row.actorUserType || "";
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

const prettyJson = (value: any) => {
  try {
    return JSON.stringify(value, (_, v) => formatIfIsoDate(v), 2);
  } catch {
    return String(value);
  }
};

const toIsoFromLocalInput = (value: string): string | undefined => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
};

const AuditLogs: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { isSuperAdmin, isOrgAdmin } = usePermissions();
  const api = useMemo(() => ApiService.getInstance(), []);

  const canView = isSuperAdmin || isOrgAdmin;
  const canViewMetadata = isSuperAdmin;

  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [action, setAction] = useState<string>("");
  const [createdAfter, setCreatedAfter] = useState<string>("");
  const [createdBefore, setCreatedBefore] = useState<string>("");

  const [selected, setSelected] = useState<AuditLogItem | null>(null);

  const actionOptions = useMemo(() => {
    return [
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
  }, []);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (action) params.set("action", action);

    const afterIso = toIsoFromLocalInput(createdAfter);
    const beforeIso = toIsoFromLocalInput(createdBefore);

    if (afterIso) params.set("createdAfter", afterIso);
    if (beforeIso) params.set("createdBefore", beforeIso);
    return params.toString();
  }, [action, createdAfter, createdBefore, limit, page]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const query = buildQuery();
      const response = await api.get(
        `/api/audit-logs${query ? `?${query}` : ""}`,
        token
      );

      const payload = (response as any)?.data ?? (response as any) ?? {};
      setItems(payload?.items || []);
      setPagination(payload?.pagination || null);
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("admin.auditLogs.errors.load", {
            defaultValue: "Failed to load audit logs",
          })
      );
    } finally {
      setLoading(false);
    }
  }, [api, buildQuery, getToken, t]);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [canView, load]);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [action, createdAfter, createdBefore, limit, page, canView, load]);

  if (!canView) {
    return (
      <div className="p-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>
              {t("admin.auditLogs.title", { defaultValue: "Audit Logs" })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {t("common.accessDenied", { defaultValue: "Access denied" })}.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={t("admin.auditLogs.title", { defaultValue: "Audit Logs" })}
        description={t("admin.auditLogs.description", {
          defaultValue: "View and filter system activity logs.",
        })}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={loading}
          >
            {t("common.refresh", { defaultValue: "Refresh" })}
          </Button>
        }
      />

      <Card className="border-border">
        <CardHeader>
          <CardTitle>
            {t("admin.auditLogs.filters.title", {
              defaultValue: "Filters",
            })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>
                {t("admin.auditLogs.filters.action", {
                  defaultValue: "Action",
                })}
              </Label>
              <Select
                value={action || "__all__"}
                onValueChange={(v) => {
                  setPage(1);
                  setAction(v === "__all__" ? "" : v);
                }}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("common.all", { defaultValue: "All" })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    {t("common.all", { defaultValue: "All" })}
                  </SelectItem>
                  {actionOptions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>
                {t("admin.auditLogs.filters.createdAfter", {
                  defaultValue: "Created After",
                })}
              </Label>
              <input
                type="datetime-local"
                value={createdAfter}
                onChange={(e) => {
                  setPage(1);
                  setCreatedAfter(e.target.value);
                }}
                className="w-full h-10 px-3 rounded-md border border-border bg-transparent text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label>
                {t("admin.auditLogs.filters.createdBefore", {
                  defaultValue: "Created Before",
                })}
              </Label>
              <input
                type="datetime-local"
                value={createdBefore}
                onChange={(e) => {
                  setPage(1);
                  setCreatedBefore(e.target.value);
                }}
                className="w-full h-10 px-3 rounded-md border border-border bg-transparent text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label>
                {t("admin.auditLogs.filters.pageSize", {
                  defaultValue: "Page Size",
                })}
              </Label>
              <Select
                value={String(limit)}
                onValueChange={(v) => {
                  setPage(1);
                  setLimit(Number(v));
                }}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 100, 200].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-muted-foreground">
              {pagination
                ? t("admin.auditLogs.totalCount", {
                    defaultValue: "{{count}} total",
                    count: pagination.totalCount,
                  })
                : ""}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAction("");
                setCreatedAfter("");
                setCreatedBefore("");
                setPage(1);
              }}
            >
              {t("common.clear", { defaultValue: "Clear" })}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-0">
          <div className="border-b px-4 py-3 flex items-center justify-between">
            <div className="text-sm font-medium">
              {t("admin.auditLogs.listTitle", { defaultValue: "Logs" })}
            </div>
            {loading ? (
              <div className="text-sm text-muted-foreground">
                {t("common.loading", { defaultValue: "Loading..." })}
              </div>
            ) : null}
          </div>

          <div className="max-h-[65vh] overflow-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-12 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground sticky top-0 z-10">
                <div className="col-span-2">
                  {t("admin.auditLogs.columns.time", { defaultValue: "Time" })}
                </div>
                <div className="col-span-2">
                  {t("admin.auditLogs.columns.actor", { defaultValue: "Actor" })}
                </div>
                <div className="col-span-2">
                  {t("admin.auditLogs.columns.role", { defaultValue: "Role" })}
                </div>
                <div className="col-span-2">
                  {t("admin.auditLogs.columns.branch", { defaultValue: "Branch" })}
                </div>
                <div className="col-span-2">
                  {t("admin.auditLogs.columns.action", { defaultValue: "Action" })}
                </div>
                <div className="col-span-2">
                  {t("admin.auditLogs.columns.entity", { defaultValue: "Entity" })}
                </div>
              </div>

              {items.length === 0 && !loading ? (
                <div className="p-4 text-sm text-muted-foreground">
                  {t("admin.auditLogs.empty", {
                    defaultValue: "No logs found.",
                  })}
                </div>
              ) : (
                items.map((row) => {
                  const actorLabel = getActorLabel(row);
                  const roleLabel = getRoleLabel(row);

                  const entityLabel =
                    row.entityDisplay ||
                    (row.entityType
                      ? `${row.entityType}${row.entityId ? `:${row.entityId}` : ""}`
                      : row.entityId || "");

                  const branchLabel =
                    row.branchName ||
                    row.branchId ||
                    t("admin.auditLogs.orgLevel", { defaultValue: "ORG_LEVEL" });

                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setSelected(row)}
                      className="w-full text-left grid grid-cols-12 items-center px-4 py-2 border-t hover:bg-muted/30"
                    >
                      <div className="col-span-2 min-w-0 text-sm truncate whitespace-nowrap">
                        {row.createdAt ? formatAuditDateTime(row.createdAt) : ""}
                      </div>
                      <div
                        className="col-span-2 min-w-0 text-sm truncate whitespace-nowrap"
                        title={actorLabel}
                      >
                        {actorLabel}
                      </div>
                      <div
                        className="col-span-2 min-w-0 text-sm truncate whitespace-nowrap"
                        title={roleLabel}
                      >
                        {roleLabel}
                      </div>
                      <div
                        className="col-span-2 min-w-0 text-sm truncate whitespace-nowrap"
                        title={branchLabel}
                      >
                        {branchLabel}
                      </div>
                      <div
                        className="col-span-2 min-w-0 text-sm font-medium truncate whitespace-nowrap"
                        title={row.action}
                      >
                        {row.action}
                      </div>
                      <div
                        className="col-span-2 min-w-0 text-sm truncate whitespace-nowrap"
                        title={entityLabel}
                      >
                        {entityLabel}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="p-4 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={!pagination?.hasPrev || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("common.previous", { defaultValue: "Previous" })}
            </Button>

            <div className="text-sm text-muted-foreground">
              {pagination
                ? t("admin.auditLogs.pagination", {
                    defaultValue: "Page {{current}} / {{total}}",
                    current: pagination.currentPage,
                    total: pagination.totalPages,
                  })
                : ""}
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={!pagination?.hasNext || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("common.next", { defaultValue: "Next" })}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => (!open ? setSelected(null) : null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col bg-card border-border text-foreground">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
            <DialogTitle>
              {t("admin.auditLogs.details.title", {
                defaultValue: "Audit Log Details",
              })}
            </DialogTitle>
          </DialogHeader>

          {selected ? (
            <div className="px-4 sm:px-6 pb-4 sm:pb-6 mt-2 overflow-y-auto flex-1 space-y-4">
              <div className="rounded-lg border border-border bg-card text-card-foreground p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">
                      {t("admin.auditLogs.fields.time", { defaultValue: "Time" })}
                    </div>
                    <div>
                      {selected.createdAt
                        ? formatAuditDateTime(selected.createdAt)
                        : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">
                      {t("admin.auditLogs.fields.actor", {
                        defaultValue: "Actor",
                      })}
                    </div>
                    <div>
                      {getActorLabel(selected)}
                      {getRoleLabel(selected)
                        ? ` (${getRoleLabel(selected)})`
                        : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">
                      {t("admin.auditLogs.fields.action", {
                        defaultValue: "Action",
                      })}
                    </div>
                    <div className="font-medium">{selected.action}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card text-card-foreground p-4 space-y-2">
                <div className="text-sm font-medium">
                  {t("admin.auditLogs.details.changes", {
                    defaultValue: "Changes",
                  })}
                </div>

                {diffBeforeAfter(selected.before, selected.after).length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {t("admin.auditLogs.details.noChanges", {
                      defaultValue: "No changes detected.",
                    })}
                  </div>
                ) : (
                  <div className="border border-border rounded-md overflow-hidden">
                    <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                      <div className="col-span-4">
                        {t("admin.auditLogs.details.field", {
                          defaultValue: "Field",
                        })}
                      </div>
                      <div className="col-span-4">
                        {t("admin.auditLogs.details.before", {
                          defaultValue: "Before",
                        })}
                      </div>
                      <div className="col-span-4">
                        {t("admin.auditLogs.details.after", {
                          defaultValue: "After",
                        })}
                      </div>
                    </div>
                    <div className="max-h-[260px] overflow-auto">
                      {diffBeforeAfter(selected.before, selected.after).map(
                        (d, idx) => (
                          <div
                            key={d.path}
                            className={`grid grid-cols-12 px-3 py-2 border-t border-border text-sm ${
                              idx % 2 === 0 ? "bg-background" : "bg-muted/30"
                            }`}
                          >
                            <div className="col-span-4 font-mono text-xs break-all">
                              {d.path}
                            </div>
                            <div className="col-span-4 text-xs break-all text-muted-foreground">
                              {summarizeValue(d.before)}
                            </div>
                            <div className="col-span-4 text-xs break-all">
                              {summarizeValue(d.after)}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {t("admin.auditLogs.details.before", {
                      defaultValue: "Before",
                    })}
                  </div>
                  <pre className="text-xs bg-muted/30 border border-border rounded-md p-3 overflow-auto max-h-[220px] sm:max-h-[320px]">
                    {prettyJson(selected.before)}
                  </pre>
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {t("admin.auditLogs.details.after", {
                      defaultValue: "After",
                    })}
                  </div>
                  <pre className="text-xs bg-muted/30 border border-border rounded-md p-3 overflow-auto max-h-[220px] sm:max-h-[320px]">
                    {prettyJson(selected.after)}
                  </pre>
                </div>
              </div>

              {canViewMetadata ? (
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {t("admin.auditLogs.details.metadata", {
                      defaultValue: "Metadata",
                    })}
                  </div>
                  <pre className="text-xs bg-muted/30 border border-border rounded-md p-3 overflow-auto max-h-[220px] sm:max-h-[240px]">
                    {prettyJson(selected.metadata)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditLogs;
