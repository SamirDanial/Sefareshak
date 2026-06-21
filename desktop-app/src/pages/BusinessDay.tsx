import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import Icon from "@mdi/react";
import {
  mdiRefresh,
  mdiLock,
  mdiLockOpenVariant,
} from "@mdi/js";

import { toast } from "@/components/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";

import branchService, { type Branch } from "@/services/branchService";
import {
  businessDayService,
  type BusinessDayCloseValidation,
  type BusinessDayReport,
  type BusinessDaySession,
} from "@/services/businessDayService";

const BusinessDay: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { getToken, userType } = useAuth();
  const { can, assignedBranchIds, isOrgAdmin } = usePermissions();

  const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
  const ORG_CHANGED_EVENT = "bellami:organizationChanged";

  const canViewReports =
    can(RESOURCES.END_OF_DAY, ACTIONS.VIEW) || can(RESOURCES.REPORTS, ACTIONS.VIEW);
  const canCloseDay =
    can(RESOURCES.END_OF_DAY, ACTIONS.CLOSE_DAY) || can(RESOURCES.REPORTS, ACTIONS.EXPORT);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>("");
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  const [session, setSession] = useState<BusinessDaySession | null>(null);
  const [validation, setValidation] = useState<BusinessDayCloseValidation | null>(null);
  const [report, setReport] = useState<BusinessDayReport | null>(null);
  const [lastClosedSessionId, setLastClosedSessionId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const printRef = useRef<HTMLDivElement | null>(null);

  const isSuperAdmin = userType === "SUPER_ADMIN";
  const hasAllBranchAccess = isSuperAdmin || isOrgAdmin;

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

    const applyOrgId = (next: string | null | undefined) => {
      const normalized = String(next || "").trim();
      setSelectedOrganizationId(normalized);
      setSelectedBranchId("");
      setSession(null);
      setValidation(null);
      setReport(null);
      setLastClosedSessionId(null);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key !== ORG_STORAGE_KEY) return;
      applyOrgId(e.newValue);
    };

    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as any;
      applyOrgId(detail?.organizationId);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
    };
  }, [isSuperAdmin]);

  const filteredBranches = useMemo(() => {
    if (!isSuperAdmin) return branches;
    if (!selectedOrganizationId) return branches;
    return branches.filter((b: Branch) => b.organizationId === selectedOrganizationId);
  }, [branches, isSuperAdmin, selectedOrganizationId]);

  const effectiveBranchId = useMemo(() => {
    if (!selectedBranchId) return "";
    if (selectedBranchId === "all") return "";
    return selectedBranchId;
  }, [selectedBranchId]);

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const fetched = await branchService.getBranches(token || undefined);
      const allowed = hasAllBranchAccess
        ? fetched
        : fetched.filter(
            (b) =>
              b.id && (assignedBranchIds.length === 0 || assignedBranchIds.includes(b.id))
          );
      setBranches(allowed);

      if (!hasAllBranchAccess) {
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

  const refresh = async (options?: { preserveReport?: boolean }) => {
    if (!effectiveBranchId) {
      setSession(null);
      setValidation(null);
      setReport(null);
      setLastClosedSessionId(null);
      return;
    }

    try {
      setIsLoading(true);
      const token = await getToken();
      const current = await businessDayService.getCurrent(effectiveBranchId, token || undefined);
      setSession(current);
      setValidation(null);
      if (!options?.preserveReport) {
        setReport(null);
        setLastClosedSessionId(null);
      }

      if (current.status === "CLOSED") {
        const rep = await businessDayService.getReport(current.id, token || undefined);
        setReport(rep);
      }
    } catch (e: any) {
      toast.error(e?.message || t("admin.businessDay.errors.loadBusinessDay", { defaultValue: "Failed to load business day" }));
    } finally {
      setIsLoading(false);
    }
  };

  const runValidation = async () => {
    if (!effectiveBranchId) return;
    try {
      setIsLoading(true);
      const token = await getToken();
      const result = await businessDayService.validateClose(effectiveBranchId, token || undefined);
      setValidation(result);
      toast.success(
        (result as any).ok
          ? t("admin.businessDay.toasts.readyToClose", { defaultValue: "Ready to close" })
          : t("admin.businessDay.toasts.cannotCloseYet", { defaultValue: "Cannot close yet" })
      );
    } catch (e: any) {
      toast.error(e?.message || t("admin.businessDay.errors.validate", { defaultValue: "Failed to validate" }));
    } finally {
      setIsLoading(false);
    }
  };

  const closeDay = async () => {
    if (!effectiveBranchId) return;
    try {
      setIsLoading(true);
      const token = await getToken();
      const result = await businessDayService.closeDay(effectiveBranchId, token || undefined);

      const closedSessionId = (result as any)?.data?.closedSession?.id;
      if (closedSessionId) {
        const rep = await businessDayService.getReport(closedSessionId, token || undefined);
        setReport(rep);
        setLastClosedSessionId(closedSessionId);
      }

      toast.success(t("admin.businessDay.toasts.closed", { defaultValue: "Business day closed" }));
      await refresh({ preserveReport: true });
    } catch (e: any) {
      const code = e?.response?.data?.code;
      const blockingOrders = e?.response?.data?.data?.blockingOrders;
      if (code === "BUSINESS_DAY_BLOCKED" && Array.isArray(blockingOrders)) {
        setValidation({ ok: false, blockingOrders });
        toast.error(t("admin.businessDay.errors.notCleared", { defaultValue: "Cannot close: some orders are not cleared" }));
      } else {
        toast.error(e?.message || t("admin.businessDay.errors.close", { defaultValue: "Failed to close business day" }));
      }
    } finally {
      setIsLoading(false);
      setConfirmOpen(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    window.print();
  };

  useEffect(() => {
    if (!canViewReports) return;
    void loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewReports]);

  useEffect(() => {
    if (!canViewReports) return;
    if (!isSuperAdmin) return;

    void loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId, canViewReports, isSuperAdmin]);

  useEffect(() => {
    if (!canViewReports) return;
    if (!isSuperAdmin) {
      if (branches.length > 0) {
        const allowed = branches.filter(
          (b) => b.id && (assignedBranchIds.length === 0 || assignedBranchIds.includes(b.id))
        );
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
  }, [effectiveBranchId, canViewReports]);

  if (!canViewReports) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.businessDay.endOfDayTitle", { defaultValue: "End of Day" })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">{t("common.accessDenied")}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={t("admin.businessDay.endOfDayTitle", { defaultValue: "End of Day" })}
        description={t("admin.businessDay.description", {
          defaultValue: "Review the current session, validate, and close the business day.",
        })}
        actions={
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
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("admin.businessDay.filterTitle", { defaultValue: "Filters" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">{t("admin.businessDay.branchLabel", { defaultValue: "Branch" })}</Label>
            <Select
              value={selectedBranchId}
              onValueChange={(v) => setSelectedBranchId(v)}
              disabled={loadingBranches}
            >
              <SelectTrigger className="bg-transparent text-foreground border-border w-full sm:w-auto sm:min-w-[220px]">
                <SelectValue
                  placeholder={t("admin.businessDay.selectBranchPlaceholder", {
                    defaultValue: "Select branch",
                  })}
                />
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

          {!isLoading && session ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">
                  {t("admin.businessDay.sessionLabel", { defaultValue: "Session" })}
                </div>
                <div className="text-sm font-semibold">#{session.sequenceNumber}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">
                  {t("admin.businessDay.statusLabel", { defaultValue: "Status" })}
                </div>
                <div className="mt-1">
                  <Badge variant={session.status === "OPEN" ? "default" : "secondary"}>
                    <span className="flex items-center gap-1">
                      <Icon path={session.status === "OPEN" ? mdiLockOpenVariant : mdiLock} size={0.55} />
                      {session.status === "OPEN"
                        ? t("admin.businessDay.statusOpen", { defaultValue: "Open" })
                        : t("admin.businessDay.statusClosed", { defaultValue: "Closed" })}
                    </span>
                  </Badge>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">
                  {t("admin.businessDay.startedLabel", { defaultValue: "Started" })}
                </div>
                <div className="text-sm font-semibold">
                  {new Date(session.startedAt).toLocaleString()}
                </div>
              </div>
            </div>
          ) : !isLoading ? (
            <div className="text-sm text-muted-foreground">
              {t("admin.businessDay.noSessionLoaded", { defaultValue: "No session loaded." })}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={runValidation}
              disabled={!effectiveBranchId || isLoading}
              variant="outline"
              className="border-border"
            >
              {t("admin.businessDay.validate", { defaultValue: "Validate" })}
            </Button>

            <Button
              disabled={
                !effectiveBranchId ||
                isLoading ||
                !canCloseDay ||
                (validation !== null && (validation as any).ok === false)
              }
              className="bg-pink-500 hover:bg-pink-600 text-white"
              onClick={() => setConfirmOpen(true)}
            >
              {t("admin.businessDay.closeDay", { defaultValue: "Close day" })}
            </Button>
          </div>

          {validation && !(validation as any).ok && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <div className="text-sm font-semibold text-red-700 dark:text-red-200">
                {t("admin.businessDay.cannotCloseTitle", {
                  defaultValue: "Cannot close: orders not cleared",
                })}
              </div>
              <div className="mt-2 space-y-2">
                {(validation as any).blockingOrders.slice(0, 20).map((o: any) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => navigate(`/admin/orders?highlightOrder=${o.id}`)}
                    className="block w-full text-left text-xs text-red-700 dark:text-red-200 hover:underline break-words whitespace-normal"
                    title={t("admin.businessDay.openOrder", { defaultValue: "Open order" })}
                  >
                    {o.orderNumber} — {o.status} / {o.paymentStatus} ({o.paymentMethod})
                    {o.reason ? ` — ${o.reason}` : ""}
                  </button>
                ))}
                {(validation as any).blockingOrders.length > 20 && (
                  <div className="text-xs text-red-700 dark:text-red-200">
                    +{(validation as any).blockingOrders.length - 20} {t("common.more")}
                  </div>
                )}
              </div>
            </div>
          )}

          {validation?.ok && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <div className="text-sm font-semibold text-green-300">
                {t("admin.businessDay.readyToCloseTitle", { defaultValue: "Ready to close" })}
              </div>
              <div className="text-xs text-green-200">
                {t("admin.businessDay.readyToCloseBody", {
                  defaultValue: "All orders in the current session are cleared.",
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {report ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {t("admin.businessDay.dailyReportTitle", { defaultValue: "Daily report" })}
                </CardTitle>
                {lastClosedSessionId && (
                  <div className="text-xs text-muted-foreground">
                    {t("admin.businessDay.sessionIdLabel", { defaultValue: "Session ID" })}: {lastClosedSessionId}
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                {t("common.print", { defaultValue: "Print" })}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={printRef} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">
                    {t("admin.businessDay.grossSales", { defaultValue: "Gross sales" })}
                  </div>
                  <div className="text-sm font-semibold">
                    {(report as any)?.data?.totals?.grossSales?.toFixed?.(2) ??
                      (report as any)?.data?.totals?.grossSales}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">
                    {t("admin.businessDay.taxTotal", { defaultValue: "Tax total" })}
                  </div>
                  <div className="text-sm font-semibold">
                    {(report as any)?.data?.totals?.taxTotal?.toFixed?.(2) ??
                      (report as any)?.data?.totals?.taxTotal}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground mb-2">
                  {t("admin.businessDay.byPaymentMethod", { defaultValue: "By payment method" })}
                </div>
                <div className="space-y-1">
                  {Object.entries((report as any)?.data?.totalsByPaymentMethod || {}).map(
                    ([k, v]) => (
                      <div key={k} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-semibold">{Number(v).toFixed(2)}</span>
                      </div>
                    )
                  )}
                </div>
              </div>

              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  {t("admin.businessDay.rawReportData", { defaultValue: "Raw report data" })}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {JSON.stringify((report as any).data, null, 2)}
                </pre>
              </details>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("admin.businessDay.confirmCloseTitle", { defaultValue: "Close business day" })}
            </DialogTitle>
            <DialogDescription>
              {t("admin.businessDay.confirmCloseDescription", {
                defaultValue:
                  "Are you sure you want to close the day? This will lock all orders for that day.",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isLoading}
            >
              {t("admin.businessDay.confirmCloseCancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              type="button"
              onClick={closeDay}
              className="bg-pink-500 hover:bg-pink-600 text-white"
              disabled={isLoading}
            >
              {t("admin.businessDay.confirmCloseConfirm", { defaultValue: "Yes, close" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BusinessDay;
