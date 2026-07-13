import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import {
  SettingsService,
  type Settings,
  type AppStatus,
} from "@/services/settingsService";

interface SettingsContextType {
  settings: Settings | null;
  isLoading: boolean;
  maxOrderQuantity: number;
  currency: string;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const { getToken, isSignedIn } = useAuth();
  const { branch, branches } = useBranch();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const selectedBranch = branch?.id ? branches.find((b) => b.id === branch.id) : null;
  const organizationAppStatus = String(
    (selectedBranch as any)?.organization?.settings?.appStatus || "LIVE"
  ).toUpperCase() as AppStatus;
  const isOrganizationUnavailable = Boolean(branch?.id) && organizationAppStatus !== "LIVE";

  const loadSettings = async () => {
    try {
      setIsLoading(true);

      // Always fetch public settings (allowExcludeOptionalIngredients) even if not signed in
      let publicSettings: {
        allowExcludeOptionalIngredients: boolean;
        appStatus: AppStatus;
      } | null = null;
      try {
        const publicResponse = await SettingsService.getPublicSettings({
          branchId: branch?.id || undefined,
        });
        if (publicResponse.success) {
          publicSettings = publicResponse.data;
        }
      } catch (error) {
        console.error("Failed to load public settings:", error);
        // Default to allowing exclusion if public settings fetch fails
        publicSettings = {
          allowExcludeOptionalIngredients: true,
          appStatus: "LIVE",
        };
      }

      const effectiveAppStatus: AppStatus = isOrganizationUnavailable
        ? organizationAppStatus
        : (publicSettings?.appStatus || "LIVE");

      // If signed in, fetch full settings and merge with public settings
      if (isSignedIn) {
        try {
          const token = (await getToken()) || undefined;
          const response = await SettingsService.getSettings(token, { branchId: branch?.id || undefined });
          if (response.success) {
            // Merge full settings with public settings (public settings take precedence for allowExcludeOptionalIngredients)
            setSettings({
              ...response.data,
              allowExcludeOptionalIngredients:
                publicSettings?.allowExcludeOptionalIngredients ?? true,
              appStatus: isOrganizationUnavailable
                ? organizationAppStatus
                : ((response.data.appStatus || effectiveAppStatus) as AppStatus),
            });
          } else {
            // Use default settings if API fails, but include public setting
            setSettings({
              maxOrderQuantity: 10,
              taxPercentage: 8.5,
              deliveryTaxPercentage: 8.5,
              deliveryFee: 3.99,
              enableMinimumOrder: false,
              minimumOrderAmount: 15.0,
              currency: "AFN",
              taxInclusive: false,
              enableFreeDelivery: false,
              freeDeliveryThreshold: 50.0,
              allowExcludeOptionalIngredients:
                publicSettings?.allowExcludeOptionalIngredients ?? true,
              appStatus: effectiveAppStatus,
            } as Settings);
          }
        } catch (error) {
          console.error("Failed to load settings:", error);
          // Use default settings if API fails, but include public setting
          setSettings({
            maxOrderQuantity: 10,
            taxPercentage: 8.5,
            deliveryTaxPercentage: 8.5,
            deliveryFee: 3.99,
            enableMinimumOrder: false,
            minimumOrderAmount: 15.0,
            currency: "USD",
            taxInclusive: false,
            enableFreeDelivery: false,
            freeDeliveryThreshold: 50.0,
            allowExcludeOptionalIngredients:
              publicSettings?.allowExcludeOptionalIngredients ?? true,
            appStatus: effectiveAppStatus,
          } as Settings);
        }
      } else {
        // Not signed in - only use public settings with defaults
        setSettings({
          maxOrderQuantity: 10,
          taxPercentage: 8.5,
          deliveryTaxPercentage: 8.5,
          deliveryFee: 3.99,
          enableMinimumOrder: false,
          minimumOrderAmount: 15.0,
          currency: "USD",
          taxInclusive: false,
          enableFreeDelivery: false,
          freeDeliveryThreshold: 50.0,
          allowExcludeOptionalIngredients:
            publicSettings?.allowExcludeOptionalIngredients ?? true,
          appStatus: effectiveAppStatus,
        } as Settings);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
      // Use default settings if everything fails
      setSettings({
        maxOrderQuantity: 10,
        taxPercentage: 8.5,
        deliveryTaxPercentage: 8.5,
        deliveryFee: 3.99,
        enableMinimumOrder: false,
        minimumOrderAmount: 15.0,
        currency: "USD",
        taxInclusive: false,
        enableFreeDelivery: false,
        freeDeliveryThreshold: 50.0,
        allowExcludeOptionalIngredients: true,
        appStatus: "LIVE",
      } as Settings);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSettings = async () => {
    await loadSettings();
  };

  useEffect(() => {
    loadSettings();
  }, [isSignedIn, branch?.id]);

  const maxOrderQuantity = settings?.maxOrderQuantity || 10;
  const branchCurrency = (() => {
    if (!branch?.id) return null;
    const selected = branches.find((b) => b.id === branch.id);
    return selected?.currency ?? null;
  })();
  const currency = branchCurrency || settings?.currency || "USD";

  const value: SettingsContextType = {
    settings,
    isLoading,
    maxOrderQuantity,
    currency,
    refreshSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
