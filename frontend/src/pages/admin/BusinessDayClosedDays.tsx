import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { toast } from "sonner";
import Icon from "@mdi/react";
import { mdiCalendarMultiple, mdiRefresh } from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "@/lib/permissions";
import branchService, { type Branch } from "@/services/branchService";
import { businessDayService, type BusinessDaySession, type Pagination } from "@/services/businessDayService";
import { useTranslation } from "react-i18next";

const BusinessDayClosedDays: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const formatDateDMonYYYY = (value: string | Date | null | undefined) => {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const hours24 = d.getHours();
    const hours12 = hours24 % 12 || 12;
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours24 >= 12 ? "PM" : "AM";
    return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()} ${hours12}:${minutes} ${ampm}`;
  };
  const { getToken, userType } = useAuth();
  const { can, assignedBranchIds } = usePermissions();

  const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";

  const canViewReports =
    can(RESOURCES.CLOSED_DAYS, ACTIONS.VIEW) || can(RESOURCES.REPORTS, ACTIONS.VIEW);
  const isSuperAdmin = userType === "SUPER_ADMIN";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>("");
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  const [sessions, setSessions] = useState<BusinessDaySession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const PAGE_SIZE = 10;

  const effectiveBranchId = useMemo(() => {
    if (!selectedBranchId) return "";
    if (selectedBranchId === "all") return "";
    return selectedBranchId;
  }, [selectedBranchId]);

  const filteredBranches = useMemo(() => {
    if (!isSuperAdmin) return branches;
    if (!selectedOrganizationId) return branches;
    return branches.filter((b: Branch) => b.organizationId === selectedOrganizationId);
  }, [branches, isSuperAdmin, selectedOrganizationId]);

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const fetched = await branchService.getBranches(token || undefined);
      const allowed = isSuperAdmin
        ? fetched
        : fetched.filter(
            (b) =>
              b.id && (assignedBranchIds.length === 0 || assignedBranchIds.includes(b.id))
          );
      setBranches(allowed);

      if (isSuperAdmin) {
        setSelectedBranchId((prev) => prev || (allowed[0]?.id || ""));
      } else {
        const forced = allowed[0]?.id || "";
        setSelectedBranchId((prev) => prev || forced);
      }
    } catch {
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    try {
      const saved = window.localStorage.getItem(ORG_STORAGE_KEY);
      setSelectedOrganizationId((saved || "").trim());
    } catch {
      setSelectedOrganizationId("");
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (!selectedBranchId) return;

    const existsInFiltered = filteredBranches.some((b: Branch) => b.id === selectedBranchId);
    if (!existsInFiltered) {
      setSelectedBranchId(filteredBranches[0]?.id || "");
    }
  }, [filteredBranches, isSuperAdmin, selectedBranchId]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (!selectedOrganizationId) return;
    if (loadingBranches) return;
    setSelectedBranchId((prev) => {
      if (prev && prev !== "all" && filteredBranches.some((b: Branch) => b.id === prev)) return prev;
      return filteredBranches[0]?.id || "";
    });
  }, [filteredBranches, isSuperAdmin, loadingBranches, selectedOrganizationId]);

  const refresh = async () => {
    if (!effectiveBranchId) {
      setSessions([]);
      setPagination(null);
      return;
    }

    try {
      setIsLoading(true);
      const token = await getToken();
      const closed = await businessDayService.listClosed(
        effectiveBranchId,
        { page: currentPage, limit: PAGE_SIZE },
        token || undefined
      );
      setSessions(closed.sessions);
      setPagination(closed.pagination);
    } catch (e: any) {
      toast.error(e?.message || t("admin.businessDayClosedDays.errors.load"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewReports) return;
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewReports]);

  useEffect(() => {
    if (!canViewReports) return;
    if (!isSuperAdmin) {
      if (branches.length > 0) {
        const allowed = branches.filter((b) => b.id && (assignedBranchIds.length === 0 || assignedBranchIds.includes(b.id)));
        const first = allowed[0]?.id || branches[0]?.id || "";
        if (first && selectedBranchId !== first) {
          setSelectedBranchId(first);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches.length, isSuperAdmin]);

  useEffect(() => {
    if (!canViewReports) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBranchId, canViewReports, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [effectiveBranchId]);

  if (!canViewReports) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.businessDayClosedDays.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">{t("common.accessDenied")}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon path={mdiCalendarMultiple} size={0.9} className="text-pink-500" />
          <h2 className="text-lg font-semibold text-pink-500">{t("admin.businessDayClosedDays.title")}</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh()}
          disabled={isLoading}
          className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
        >
          <Icon path={mdiRefresh} size={0.6} className={isLoading ? "mr-1 animate-spin" : "mr-1"} />
          {t("common.refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("admin.businessDayClosedDays.filterTitle", { defaultValue: "Filters" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">{t("admin.businessDayClosedDays.branchLabel")}</Label>
            <Select
              value={selectedBranchId}
              onValueChange={(v) => setSelectedBranchId(v)}
              disabled={loadingBranches}
            >
              <SelectTrigger className="bg-transparent text-foreground border-border w-full sm:w-auto sm:min-w-[220px]">
                <SelectValue placeholder={t("admin.businessDayClosedDays.selectBranchPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {filteredBranches.map((b: Branch) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name || b.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.businessDayClosedDays.listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-pink-500" />
                <span>{t("common.loading")}</span>
              </div>
            </div>
          ) : !effectiveBranchId ? (
            <div className="text-sm text-muted-foreground">{t("admin.businessDayClosedDays.selectBranchToView")}</div>
          ) : sessions.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("admin.businessDayClosedDays.empty")}</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/admin/business-day/closed/${s.id}`)}
                    className="w-full rounded-lg border border-border p-3 text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {t("admin.businessDayClosedDays.sessionLabel", { number: s.sequenceNumber })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateDMonYYYY(s.startedAt)} → {s.endedAt ? formatDateDMonYYYY(s.endedAt) : "—"}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{s.status}</div>
                    </div>
                  </button>
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasPrev || isLoading}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="border-border hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
                  >
                    {t("common.previous")}
                  </Button>

                  <div className="text-xs text-muted-foreground">
                    {t("common.page", {
                      current: pagination.currentPage,
                      total: pagination.totalPages,
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasNext || isLoading}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="border-border hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
                  >
                    {t("common.next")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BusinessDayClosedDays;
