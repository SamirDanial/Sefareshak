import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Icon from "@mdi/react";
import { mdiCalendarCheckOutline, mdiRefresh, mdiLock, mdiLockOpenVariant } from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "@/lib/permissions";
import branchService, { type Branch } from "@/services/branchService";
import {
  businessDayService,
  type BusinessDayCloseValidation,
  type BusinessDayReport,
  type BusinessDaySession,
} from "@/services/businessDayService";
import { useTranslation } from "react-i18next";
import ApiService from "@/services/apiService";

const BusinessDay: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getToken, userType } = useAuth();
  const { can, assignedBranchIds, isOrgAdmin } = usePermissions();

  const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";

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

  const [settings, setSettings] = useState<any | null>(null);
  const [posDeviceErrorOpen, setPosDeviceErrorOpen] = useState(false);
  const [posDeviceErrorMessage, setPosDeviceErrorMessage] = useState<string>("");

  const [isLoading, setIsLoading] = useState(false);
  const printRef = useRef<HTMLDivElement | null>(null);

  const isSuperAdmin = userType === "SUPER_ADMIN";
  const hasAllBranchAccess = isSuperAdmin || isOrgAdmin;

  const fiskalyEnabled = Boolean((settings as any)?.fiskalyEnabled);
  const fiskalyEnvironment = String((settings as any)?.fiskalyEnvironment || "").toUpperCase();
  const fiskalyLive = fiskalyEnabled && fiskalyEnvironment === "LIVE";
  // Web admin has no POS device selection; if Fiskaly is LIVE we must prevent closing/validating.
  const posDeviceRequiredButMissing = Boolean(fiskalyLive);

  const showPosDeviceErrorDialog = (message: string) => {
    setPosDeviceErrorMessage(String(message || "").trim() || t("common.error"));
    setPosDeviceErrorOpen(true);
  };

  const handlePosDeviceErrorFromBackend = (e: any) => {
    const serverCode = e?.response?.data?.code || e?.data?.code;
    const serverMessage =
      e?.response?.data?.error ||
      e?.response?.data?.message ||
      e?.data?.error ||
      e?.data?.message ||
      e?.message ||
      undefined;

    if (
      String(serverCode || "").trim() === "POS_DEVICE_REQUIRED" ||
      String(serverCode || "").trim() === "FISKALY_POS_DEVICE_NOT_PROVISIONED"
    ) {
      const normalized = String(serverCode || "").trim();
      const fallback =
        normalized === "POS_DEVICE_REQUIRED"
          ? t("admin.businessDay.posDeviceRequired")
          : t("admin.businessDay.posDeviceNotProvisioned");
      showPosDeviceErrorDialog(String(serverMessage || "").trim() || fallback);
      return true;
    }
    return false;
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const api = ApiService.getInstance();
        const raw = await api.get(`/api/user/settings`, token || undefined);
        if (cancelled) return;
        setSettings((raw as any)?.data ?? raw);
      } catch {
        if (cancelled) return;
        setSettings(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [getToken, selectedOrganizationId]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    try {
      const saved = window.localStorage.getItem(ORG_STORAGE_KEY);
      setSelectedOrganizationId((saved || "").trim());
    } catch {
      setSelectedOrganizationId("");
    }
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
    } catch (e) {
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
      if (handlePosDeviceErrorFromBackend(e)) {
        return;
      }
      toast.error(e?.message || t("admin.businessDay.errors.loadBusinessDay"));
    } finally {
      setIsLoading(false);
    }
  };

  const runValidation = async () => {
    if (!effectiveBranchId) return;
    if (posDeviceRequiredButMissing) {
      showPosDeviceErrorDialog(t("admin.businessDay.posDeviceRequired"));
      return;
    }
    try {
      setIsLoading(true);
      const token = await getToken();
      const result = await businessDayService.validateClose(effectiveBranchId, token || undefined);
      setValidation(result);
      toast.success(
        result.ok ? t("admin.businessDay.toasts.readyToClose") : t("admin.businessDay.toasts.cannotCloseYet")
      );
    } catch (e: any) {
      if (handlePosDeviceErrorFromBackend(e)) {
        return;
      }
      toast.error(e?.message || t("admin.businessDay.errors.validate"));
    } finally {
      setIsLoading(false);
    }
  };

  const closeDay = async () => {
    if (!effectiveBranchId) return;
    if (posDeviceRequiredButMissing) {
      showPosDeviceErrorDialog(t("admin.businessDay.posDeviceRequired"));
      return;
    }
    try {
      setIsLoading(true);
      const token = await getToken();
      const result = await businessDayService.closeDay(effectiveBranchId, token || undefined);

      const closedSessionId = result?.data?.closedSession?.id;
      if (closedSessionId) {
        const rep = await businessDayService.getReport(closedSessionId, token || undefined);
        setReport(rep);
        setLastClosedSessionId(closedSessionId);
      }

      toast.success(t("admin.businessDay.toasts.closed"));
      // Refresh current session (which will now be the next OPEN session), but keep the
      // just-closed report visible for review/printing.
      await refresh({ preserveReport: true });
    } catch (e: any) {
      if (handlePosDeviceErrorFromBackend(e)) {
        return;
      }
      const code = e?.response?.data?.code;
      const blockingOrders = e?.response?.data?.data?.blockingOrders;
      if (code === "BUSINESS_DAY_BLOCKED" && Array.isArray(blockingOrders)) {
        setValidation({ ok: false, blockingOrders });
        toast.error(t("admin.businessDay.errors.notCleared"));
      } else {
        toast.error(e?.message || t("admin.businessDay.errors.close"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    window.print();
  };

  useEffect(() => {
    if (!canViewReports) return;
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewReports]);

  useEffect(() => {
    if (!canViewReports) return;
    // Non-superadmin staff should always have a concrete branch selected.
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
  }, [effectiveBranchId, canViewReports]);

  if (!canViewReports) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.businessDay.endOfDayTitle")}</CardTitle>
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
          <Icon path={mdiCalendarCheckOutline} size={0.9} className="text-pink-500" />
          <h2 className="text-lg font-semibold text-pink-500">{t("admin.businessDay.endOfDayTitle")}</h2>
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
            {t("admin.businessDay.filterTitle", { defaultValue: "Filters" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">{t("admin.businessDay.branchLabel")}</Label>
            <Select
              value={selectedBranchId}
              onValueChange={(v) => setSelectedBranchId(v)}
              disabled={loadingBranches}
            >
              <SelectTrigger className="bg-transparent text-foreground border-border w-full sm:w-auto sm:min-w-[220px]">
                <SelectValue placeholder={t("admin.businessDay.selectBranchPlaceholder")} />
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
                <div className="text-xs text-muted-foreground">{t("admin.businessDay.sessionLabel")}</div>
                <div className="text-sm font-semibold">#{session.sequenceNumber}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">{t("admin.businessDay.statusLabel")}</div>
                <div className="mt-1">
                  <Badge variant={session.status === "OPEN" ? "default" : "secondary"}>
                    <span className="flex items-center gap-1">
                      <Icon
                        path={session.status === "OPEN" ? mdiLockOpenVariant : mdiLock}
                        size={0.55}
                      />
                      {session.status === "OPEN"
                        ? t("admin.businessDay.statusOpen", { defaultValue: "Open" })
                        : t("admin.businessDay.statusClosed", { defaultValue: "Closed" })}
                    </span>
                  </Badge>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">{t("admin.businessDay.startedLabel")}</div>
                <div className="text-sm font-semibold">
                  {new Date(session.startedAt).toLocaleString()}
                </div>
              </div>
            </div>
          ) : !isLoading ? (
            <div className="text-sm text-muted-foreground">{t("admin.businessDay.noSessionLoaded")}</div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={runValidation}
              disabled={!effectiveBranchId || isLoading}
              variant="outline"
              className="border-border"
            >
              {t("admin.businessDay.validate")}
            </Button>
            {posDeviceRequiredButMissing ? (
              <Button
                disabled={!effectiveBranchId || isLoading || !canCloseDay}
                onClick={() => showPosDeviceErrorDialog(t("admin.businessDay.posDeviceRequired"))}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {t("admin.businessDay.closeDay")}
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={
                      !effectiveBranchId ||
                      isLoading ||
                      !canCloseDay ||
                      (validation !== null && (validation as any).ok === false)
                    }
                    className="bg-pink-500 hover:bg-pink-600 text-white"
                  >
                    {t("admin.businessDay.closeDay")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border text-foreground">
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("admin.businessDay.confirmCloseTitle", {
                        defaultValue: "Close business day",
                      })}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                      {t("admin.businessDay.confirmCloseDescription", {
                        defaultValue:
                          "Are you sure you want to close the day? This will lock all orders for that day.",
                      })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-border hover:bg-muted hover:text-foreground text-foreground">
                      {t("admin.businessDay.confirmCloseCancel", { defaultValue: "Cancel" })}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={closeDay}
                      className="bg-pink-500 hover:bg-pink-600 text-white"
                    >
                      {t("admin.businessDay.confirmCloseConfirm", { defaultValue: "Yes, close" })}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {validation && !validation.ok && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <div className="text-sm font-semibold text-red-300">
                {t("admin.businessDay.cannotCloseTitle")}
              </div>
              <div className="mt-2 space-y-2">
                {validation.blockingOrders.slice(0, 20).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => navigate(`/admin/orders?highlightOrder=${o.id}`)}
                    className="block w-full text-left text-xs text-red-200 hover:underline"
                    title={t("admin.businessDay.openOrder", { defaultValue: "Open order" })}
                  >
                    {o.orderNumber} — {o.status} / {o.paymentStatus} ({o.paymentMethod})
                    {o.reason ? ` — ${o.reason}` : ""}
                  </button>
                ))}
                {validation.blockingOrders.length > 20 && (
                  <div className="text-xs text-red-200">
                    +{validation.blockingOrders.length - 20} {t("common.more")}
                  </div>
                )}
              </div>
            </div>
          )}

          {validation?.ok && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <div className="text-sm font-semibold text-green-300">{t("admin.businessDay.readyToCloseTitle")}</div>
              <div className="text-xs text-green-200">
                {t("admin.businessDay.readyToCloseBody")}
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
                <CardTitle className="text-base">{t("admin.businessDay.dailyReportTitle")}</CardTitle>
                {lastClosedSessionId && (
                  <div className="text-xs text-muted-foreground">
                    {t("admin.businessDay.sessionIdLabel")}: {lastClosedSessionId}
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                {t("common.print")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={printRef} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">{t("admin.businessDay.grossSales")}</div>
                  <div className="text-sm font-semibold">
                    {report?.data?.totals?.grossSales?.toFixed?.(2) ?? report?.data?.totals?.grossSales}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">{t("admin.businessDay.taxTotal")}</div>
                  <div className="text-sm font-semibold">
                    {report?.data?.totals?.taxTotal?.toFixed?.(2) ?? report?.data?.totals?.taxTotal}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground mb-2">{t("admin.businessDay.byPaymentMethod")}</div>
                <div className="space-y-1">
                  {Object.entries(report?.data?.totalsByPaymentMethod || {}).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-semibold">{Number(v).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-semibold">{t("admin.businessDay.rawReportData")}</summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {JSON.stringify(report.data, null, 2)}
                </pre>
              </details>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={posDeviceErrorOpen} onOpenChange={setPosDeviceErrorOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.error")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {posDeviceErrorMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="bg-pink-500 hover:bg-pink-600 text-white">
              {t("common.close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BusinessDay;
