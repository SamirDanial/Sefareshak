import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BRANCH_STORAGE_KEY = "nf:selectedBranchId";
const BRANCH_NAME_STORAGE_KEY = "nf:selectedBranchName";

export type BranchContextValue = {
  selectedBranchId: string;
  selectedBranchName: string | null;
  setSelectedBranch: (id: string, name?: string | null) => void;
  clearSelectedBranch: () => void;
  isLoading: boolean;
};

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

export function BranchProvider({
  children,
  organizationId,
}: {
  children: React.ReactNode;
  organizationId: string | null;
}) {
  const [selectedBranchId, setSelectedBranchIdState] = useState<string>("");
  const [selectedBranchName, setSelectedBranchNameState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const prevOrgIdRef = useRef<string | null>(null);
  const didLoadRef = useRef(false);
  const isInitializingOrgRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      try {
        isInitializingOrgRef.current = true;
        const [rawId, rawName] = await Promise.all([
          AsyncStorage.getItem(BRANCH_STORAGE_KEY),
          AsyncStorage.getItem(BRANCH_NAME_STORAGE_KEY),
        ]);
        const id = (rawId || "").trim();
        const name = (rawName || "").trim();
        setSelectedBranchIdState(id);
        setSelectedBranchNameState(name.length > 0 ? name : null);
        prevOrgIdRef.current = organizationId;
      } catch {
        setSelectedBranchIdState("");
        setSelectedBranchNameState(null);
      } finally {
        setIsLoading(false);
        didLoadRef.current = true;
        // Small delay to prevent race conditions
        setTimeout(() => {
          isInitializingOrgRef.current = false;
        }, 100);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear branch when organization changes (after initial load)
  useEffect(() => {
    if (!didLoadRef.current) return;
    if (!organizationId) return;
    if (isInitializingOrgRef.current) return; // Skip during initial org setup
    if (prevOrgIdRef.current === organizationId) return;
    prevOrgIdRef.current = organizationId;
    setSelectedBranchIdState("");
    setSelectedBranchNameState(null);
    void Promise.all([
      AsyncStorage.removeItem(BRANCH_STORAGE_KEY),
      AsyncStorage.removeItem(BRANCH_NAME_STORAGE_KEY),
    ]);
  }, [organizationId]);

  const setSelectedBranch = useCallback((id: string, name?: string | null) => {
    const trimmedId = (id || "").trim();
    const trimmedName = (name || "").trim();
    setSelectedBranchIdState(trimmedId);
    setSelectedBranchNameState(trimmedName.length > 0 ? trimmedName : null);
    void (async () => {
      try {
        await Promise.all([
          trimmedId.length > 0
            ? AsyncStorage.setItem(BRANCH_STORAGE_KEY, trimmedId)
            : AsyncStorage.removeItem(BRANCH_STORAGE_KEY),
          trimmedName.length > 0
            ? AsyncStorage.setItem(BRANCH_NAME_STORAGE_KEY, trimmedName)
            : AsyncStorage.removeItem(BRANCH_NAME_STORAGE_KEY),
        ]);
      } catch {
        // ignore
      }
    })();
  }, []);

  const clearSelectedBranch = useCallback(() => {
    setSelectedBranchIdState("");
    setSelectedBranchNameState(null);
    void Promise.all([
      AsyncStorage.removeItem(BRANCH_STORAGE_KEY),
      AsyncStorage.removeItem(BRANCH_NAME_STORAGE_KEY),
    ]);
  }, []);

  const value = useMemo<BranchContextValue>(
    () => ({
      selectedBranchId,
      selectedBranchName,
      setSelectedBranch,
      clearSelectedBranch,
      isLoading,
    }),
    [selectedBranchId, selectedBranchName, setSelectedBranch, clearSelectedBranch, isLoading]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    throw new Error("useBranch must be used within a BranchProvider");
  }
  return ctx;
}
