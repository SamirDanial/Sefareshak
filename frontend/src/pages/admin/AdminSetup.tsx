import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import branchService, {
  type Branch,
  type Organization,
  type BranchType,
} from "@/services/branchService";

const AdminSetup: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [branchTypes, setBranchTypes] = useState<BranchType[]>([]);
  const [unassignedBranches, setUnassignedBranches] = useState<Branch[]>([]);

  const [newOrgName, setNewOrgName] = useState("");
  const [newTypeName, setNewTypeName] = useState("");

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    setLoading(true);
    try {
      const [orgs, types, unassigned] = await Promise.all([
        branchService.getOrganizations(token),
        branchService.getBranchTypes(token),
        branchService.getUnassignedBranches(token),
      ]);
      setOrganizations(orgs);
      setBranchTypes(types);
      setUnassignedBranches(unassigned);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load setup data");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createOrganization = async () => {
    const name = newOrgName.trim();
    if (!name) {
      toast.error("Organization name is required");
      return;
    }

    const token = await getToken();
    if (!token) return;

    setLoading(true);
    try {
      await branchService.createOrganization({ name }, token);
      setNewOrgName("");
      toast.success("Organization created");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create organization");
    } finally {
      setLoading(false);
    }
  };

  const createBranchType = async () => {
    const name = newTypeName.trim();
    if (!name) {
      toast.error("Branch type name is required");
      return;
    }

    const token = await getToken();
    if (!token) return;

    setLoading(true);
    try {
      await branchService.createBranchType({ name }, token);
      setNewTypeName("");
      toast.success("Branch type created");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create branch type");
    } finally {
      setLoading(false);
    }
  };

  const assignBranch = async (branchId: string, orgId: string, typeId: string | null) => {
    const token = await getToken();
    if (!token) return;

    setLoading(true);
    try {
      await branchService.setBranchOrganization(branchId, orgId, token);
      if (typeId !== undefined) {
        await branchService.setBranchType(branchId, typeId, token);
      }
      toast.success("Location assigned");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to assign location");
    } finally {
      setLoading(false);
    }
  };

  const [selectedOrgByBranch, setSelectedOrgByBranch] = useState<Record<string, string>>({});
  const [selectedTypeByBranch, setSelectedTypeByBranch] = useState<Record<string, string | "none">>({});

  useEffect(() => {
    setSelectedOrgByBranch((prev) => {
      const next = { ...prev };
      for (const b of unassignedBranches) {
        if (!next[b.id]) {
          next[b.id] = organizations[0]?.id || "";
        }
      }
      return next;
    });

    setSelectedTypeByBranch((prev) => {
      const next = { ...prev };
      for (const b of unassignedBranches) {
        if (!next[b.id]) {
          next[b.id] = "none";
        }
      }
      return next;
    });
  }, [unassignedBranches, organizations]);

  const canComplete = useMemo(() => unassignedBranches.length === 0, [unassignedBranches.length]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-pink-500">{t("admin.setup.title", { defaultValue: "Setup" })}</h2>
        <p className="text-sm text-muted-foreground">
          {t("admin.setup.description", {
            defaultValue:
              "Assign all locations to an organization before using the admin panel.",
          })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.setup.organizations", { defaultValue: "Organizations" })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("admin.setup.newOrganization", { defaultValue: "New organization" })}</Label>
              <Input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="e.g. Bellami Group" />
            </div>
            <div className="flex items-end">
              <Button onClick={createOrganization} disabled={loading} className="bg-pink-500 hover:bg-pink-600 text-white w-full sm:w-auto">
                {t("admin.setup.create", { defaultValue: "Create" })}
              </Button>
            </div>
          </div>

          {organizations.length === 0 ? (
            <div className="text-sm text-muted-foreground">No organizations yet.</div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {organizations.length} organization{organizations.length === 1 ? "" : "s"}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.setup.branchTypes", { defaultValue: "Branch types" })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("admin.setup.newBranchType", { defaultValue: "New branch type" })}</Label>
              <Input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="e.g. Food truck" />
            </div>
            <div className="flex items-end">
              <Button onClick={createBranchType} disabled={loading} className="bg-pink-500 hover:bg-pink-600 text-white w-full sm:w-auto">
                {t("admin.setup.create", { defaultValue: "Create" })}
              </Button>
            </div>
          </div>

          {branchTypes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No branch types yet.</div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {branchTypes.length} type{branchTypes.length === 1 ? "" : "s"}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.setup.unassignedLocations", { defaultValue: "Unassigned locations" })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {unassignedBranches.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
              {canComplete
                ? t("admin.setup.complete", { defaultValue: "Setup complete." })
                : ""}
            </div>
          ) : organizations.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
              Create an organization first.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unassignedBranches.map((b) => {
                  const selectedOrg = selectedOrgByBranch[b.id] || organizations[0].id;
                  const selectedType = selectedTypeByBranch[b.id] ?? "none";
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name || b.id}</TableCell>
                      <TableCell>
                        <Select
                          value={selectedOrg}
                          onValueChange={(v) =>
                            setSelectedOrgByBranch((prev) => ({ ...prev, [b.id]: v }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {organizations.map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={selectedType}
                          onValueChange={(v) =>
                            setSelectedTypeByBranch((prev) => ({ ...prev, [b.id]: v as any }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {branchTypes.map((t2) => (
                              <SelectItem key={t2.id} value={t2.id}>
                                {t2.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          disabled={loading || !selectedOrg}
                          className="bg-pink-500 hover:bg-pink-600 text-white"
                          onClick={() =>
                            assignBranch(
                              b.id,
                              selectedOrg,
                              selectedType === "none" ? null : selectedType
                            )
                          }
                        >
                          Assign
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={refresh}
              disabled={loading}
              className="border-border"
            >
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSetup;
