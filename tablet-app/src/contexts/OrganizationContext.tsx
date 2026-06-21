import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ApiService from "@/src/services/apiService";
import SyncService from "@/src/services/syncService";
import pushNotificationService from "@/src/services/pushNotificationService";

export type OrganizationSummary = {
  id: string;
  name?: string | null;
};

type OrganizationContextValue = {
  selectedOrganizationId: string | null;
  selectedOrganizationName: string | null;
  setSelectedOrganizationId: (organizationId: string, organizationName?: string | null) => Promise<void>;
  clearSelectedOrganizationId: () => Promise<void>;
  isLoading: boolean;
};

const ORG_STORAGE_KEY = "nf:selectedOrganizationId";
const ORG_NAME_STORAGE_KEY = "nf:selectedOrganizationName";
const LEGACY_ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const LEGACY_ORG_NAME_STORAGE_KEY = "bellami:selectedOrganizationName";

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [selectedOrganizationId, setSelectedOrganizationIdState] = useState<string | null>(null);
  const [selectedOrganizationName, setSelectedOrganizationNameState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // One-time migration from legacy 'bellami:' keys to 'nf:' keys
        const [legacyId, legacyName] = await Promise.all([
          AsyncStorage.getItem(LEGACY_ORG_STORAGE_KEY),
          AsyncStorage.getItem(LEGACY_ORG_NAME_STORAGE_KEY),
        ]);
        if (legacyId !== null || legacyName !== null) {
          await Promise.all([
            legacyId !== null ? AsyncStorage.setItem(ORG_STORAGE_KEY, legacyId) : Promise.resolve(),
            legacyName !== null ? AsyncStorage.setItem(ORG_NAME_STORAGE_KEY, legacyName) : Promise.resolve(),
            AsyncStorage.removeItem(LEGACY_ORG_STORAGE_KEY),
            AsyncStorage.removeItem(LEGACY_ORG_NAME_STORAGE_KEY),
          ]);
        }

        const [rawId, rawName] = await Promise.all([
          AsyncStorage.getItem(ORG_STORAGE_KEY),
          AsyncStorage.getItem(ORG_NAME_STORAGE_KEY),
        ]);

        const id = (rawId || "").trim();
        const name = (rawName || "").trim();

        const nextId = id.length > 0 ? id : null;
        ApiService.setSelectedOrganizationIdCache(nextId);
        setSelectedOrganizationIdState(nextId);
        setSelectedOrganizationNameState(name.length > 0 ? name : null);

        if (nextId) {
          void SyncService.getInstance().prefetchCatalogForOrganization(nextId);
        }
      } catch {
        ApiService.setSelectedOrganizationIdCache(null);
        setSelectedOrganizationIdState(null);
        setSelectedOrganizationNameState(null);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const setSelectedOrganizationId = useCallback(
    async (organizationId: string, organizationName?: string | null) => {
      const id = (organizationId || "").trim();
      const name = (organizationName || "").trim();

      const nextId = id.length > 0 ? id : null;
      ApiService.setSelectedOrganizationIdCache(nextId);
      setSelectedOrganizationIdState(nextId);
      setSelectedOrganizationNameState(name.length > 0 ? name : null);

      await Promise.all([
        AsyncStorage.setItem(ORG_STORAGE_KEY, id),
        name.length > 0
          ? AsyncStorage.setItem(ORG_NAME_STORAGE_KEY, name)
          : AsyncStorage.removeItem(ORG_NAME_STORAGE_KEY),
      ]);

      if (nextId) {
        void SyncService.getInstance().prefetchCatalogForOrganization(nextId);
      }
    },
    []
  );

  const clearSelectedOrganizationId = useCallback(async () => {
    ApiService.setSelectedOrganizationIdCache(null);
    setSelectedOrganizationIdState(null);
    setSelectedOrganizationNameState(null);
    await Promise.all([
      AsyncStorage.removeItem(ORG_STORAGE_KEY),
      AsyncStorage.removeItem(ORG_NAME_STORAGE_KEY),
    ]);
  }, []);

  const value = useMemo<OrganizationContextValue>(
    () => ({
      selectedOrganizationId,
      selectedOrganizationName,
      setSelectedOrganizationId,
      clearSelectedOrganizationId,
      isLoading,
    }),
    [
      selectedOrganizationId,
      selectedOrganizationName,
      setSelectedOrganizationId,
      clearSelectedOrganizationId,
      isLoading,
    ]
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
  ORG_NAME_STORAGE_KEY,
};
