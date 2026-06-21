import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type OrganizationSummary = {
  id: string;
  name?: string | null;
};

type OrganizationContextValue = {
  selectedOrganizationId: string | null;
  setSelectedOrganizationId: (organizationId: string) => Promise<void>;
  clearSelectedOrganizationId: () => Promise<void>;
  isLoading: boolean;
};

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [selectedOrganizationId, setSelectedOrganizationIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(ORG_STORAGE_KEY);
        const val = (raw || "").trim();
        setSelectedOrganizationIdState(val.length > 0 ? val : null);
      } catch {
        setSelectedOrganizationIdState(null);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const setSelectedOrganizationId = useCallback(async (organizationId: string) => {
    const val = (organizationId || "").trim();
    setSelectedOrganizationIdState(val.length > 0 ? val : null);
    await AsyncStorage.setItem(ORG_STORAGE_KEY, val);
  }, []);

  const clearSelectedOrganizationId = useCallback(async () => {
    setSelectedOrganizationIdState(null);
    await AsyncStorage.removeItem(ORG_STORAGE_KEY);
  }, []);

  const value = useMemo<OrganizationContextValue>(
    () => ({
      selectedOrganizationId,
      setSelectedOrganizationId,
      clearSelectedOrganizationId,
      isLoading,
    }),
    [selectedOrganizationId, setSelectedOrganizationId, clearSelectedOrganizationId, isLoading]
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return ctx;
}

export const organizationStorage = {
  ORG_STORAGE_KEY,
};
