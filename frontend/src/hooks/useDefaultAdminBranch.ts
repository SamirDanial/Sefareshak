import { useEffect } from "react";
import { usePermissions } from "@/contexts/PermissionContext";

type Params = {
  selectedBranchId: string;
  setSelectedBranchId: (branchId: string) => void;
  branches?: Array<{ id: string }>;
  branchIdFromUrl?: string | null;
  highlightIdFromUrl?: string | null;
};

export default function useDefaultAdminBranch({
  selectedBranchId,
  setSelectedBranchId,
  branches,
  branchIdFromUrl,
  highlightIdFromUrl,
}: Params) {
  const { assignedBranchIds, isLoading } = usePermissions();

  useEffect(() => {
    if (isLoading) return;
    if (selectedBranchId) return;
    if (branchIdFromUrl) return;
    if (highlightIdFromUrl) return;

    if (assignedBranchIds.length !== 1) return;
    const candidate = assignedBranchIds[0];
    if (!candidate) return;

    if (branches && branches.length > 0) {
      const exists = branches.some((b) => b.id === candidate);
      if (!exists) return;
    }

    setSelectedBranchId(candidate);
  }, [
    assignedBranchIds,
    branchIdFromUrl,
    branches,
    highlightIdFromUrl,
    isLoading,
    selectedBranchId,
    setSelectedBranchId,
  ]);
}
