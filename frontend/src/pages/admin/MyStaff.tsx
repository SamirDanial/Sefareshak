import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@mdi/react";
import { mdiAccountGroup, mdiMagnify, mdiRefresh } from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import branchService, { type Branch } from "@/services/branchService";
import { staffService, type StaffUser } from "@/services/staffService";

const MyStaff: React.FC = () => {
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);

  const filteredStaff = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return staff.filter((u) => {
      if (!term) return true;
      const name = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase();
      const email = (u.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [staff, searchTerm]);

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const fetchedBranches = await branchService.getBranches(token || undefined);
      setBranches(fetchedBranches);

      if (fetchedBranches.length > 0) {
        setSelectedBranchId((prev) => {
          if (prev && fetchedBranches.some((b) => b.id === prev)) return prev;
          return fetchedBranches[0].id;
        });
      }
    } catch (e) {
      console.error("Error loading branches:", e);
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => {
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  const loadStaff = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const staffUsers = await staffService.getStaff(
        {
          branchId: selectedBranchId || undefined,
          includeInactive: false,
        },
        token || undefined
      );

      // Defensive: include USER only if they have org membership (orgRole)
      setStaff(staffUsers.filter((u) => u.userType !== "USER" || Boolean(u.orgRole)));
    } catch (e) {
      console.error("Failed to load staff", e);
      setStaff([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedBranchId) return;
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await loadBranches();
      if (selectedBranchId) {
        await loadStaff();
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
            <Icon path={mdiAccountGroup} size={0.9} className="text-pink-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-pink-500">My Staff</h2>
            <p className="text-sm text-muted-foreground">
              View staff assigned to your branches.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={loading || loadingBranches || refreshing}
          className="bg-background text-foreground border-border hover:bg-muted"
        >
          <Icon
            path={mdiRefresh}
            size={0.67}
            className={refreshing || loading ? "animate-spin mr-2" : "mr-2"}
          />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Branch</div>
              <Select
                value={selectedBranchId}
                onValueChange={(v) => setSelectedBranchId(v)}
                disabled={loadingBranches || branches.length === 0}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Search</div>
              <div className="relative">
                <Icon
                  path={mdiMagnify}
                  size={0.67}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or email"
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon path={mdiRefresh} size={0.67} className="animate-spin" />
                <span className="text-sm">Loading staff...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredStaff.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  No staff found.
                </div>
              ) : (
                filteredStaff.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-3 rounded-md border border-border bg-background"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <div className="text-xs font-medium text-muted-foreground">
                      {u.userType.replace(/_/g, " ")}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MyStaff;
