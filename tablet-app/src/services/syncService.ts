import NetInfo from "@react-native-community/netinfo";
import LocalDbService, { LocalOrder } from "./localDbService";
import { posOrderService, CreatePosOrderInput } from "./posOrderService";
import branchService from "./branchService";
import ApiService from "./apiService";
import { categoryService } from "./categoryService";
import { mealService } from "./mealService";

class SyncService {
  private static instance: SyncService;
  private isSyncing = false;
  private token: string | null = null;
  private isPrefetching = false;

  private constructor() {
    // Listen for network connectivity changes
    NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void this.syncOfflineOrders();
      }
    });
  }

  public static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      // Sync immediately when token becomes available and connected
      void NetInfo.fetch().then((state) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          void this.syncOfflineOrders();
        }
      });
    }
  }

  /**
   * Background prefetch catalog and settings for all branches under an organization
   */
  public async prefetchCatalogForOrganization(organizationId: string, customToken?: string | null): Promise<void> {
    const token = customToken || this.token;
    if (!token || this.isPrefetching) return;

    const netState = await NetInfo.fetch();
    const isOnline = netState.isConnected && netState.isInternetReachable !== false;
    if (!isOnline) {
      return;
    }

    this.isPrefetching = true;

    try {
      // 1. Fetch and cache all branches of organization
      const branches = await branchService.getBranches(token, { organizationId });
      const localDb = LocalDbService.getInstance();
      
      if (!branches || branches.length === 0) {
        this.isPrefetching = false;
        return;
      }

      const branchesToCache: any[] = [];

      // 2. Fetch and cache settings, categories, meals for EACH branch
      for (const branch of branches) {
        try {
          
          // Fetch settings and cache in SQLite settings table
          const settingsRaw = await ApiService.getInstance().getSettings(token, branch.id);
          const settingsData = (settingsRaw as any)?.data ?? settingsRaw;
          await localDb.cacheSettings(branch.id, settingsData);

          // Update branch settings directly in branches table
          const fullBranchCachedData = {
            id: branch.id,
            organizationId: branch.organizationId || organizationId,
            name: branch.name || "",
            deliveryFee: branch.deliveryFee,
            deliveryTaxPercentage: branch.deliveryTaxPercentage,
            taxPercentage: branch.taxPercentage,
            taxInclusive: branch.taxInclusive,
            currency: settingsData?.currency || branch.currency || "USD",
            timezone: settingsData?.timezone || (branch as any).timezone || null,
            pickupTakeawayServiceFee: (settingsData as any)?.pickupTakeawayServiceFee !== undefined ? Number((settingsData as any).pickupTakeawayServiceFee) : 0,
            serviceTaxPercentage: (settingsData as any)?.serviceTaxPercentage !== undefined ? Number((settingsData as any).serviceTaxPercentage) : 0,
          };
          
          branchesToCache.push(fullBranchCachedData);

          // Fetch categories and meals
          const [categoryResult, mealResult] = await Promise.all([
            categoryService.getCategories(1, 200, "", "listOrder", "asc", token, "ACTIVE"),
            mealService.getMeals(1, 400, "", "listOrder", "asc", "", "ACTIVE", token, undefined, branch.id),
          ]);

          const nextCategories = Array.isArray(categoryResult?.categories) ? categoryResult.categories : [];
          const nextMeals = Array.isArray(mealResult?.meals) ? mealResult.meals : [];

          // Debug: Log first meal to check if branchAvailabilities is present
          if (nextMeals.length > 0) {
            const icedCoffee = nextMeals.find((m: any) => m.name?.toLowerCase().includes("coffee")) || nextMeals[0];
            }

          // Cache categories for this branch
          await localDb.cacheCategories(
            branch.id,
            nextCategories.map((c: any) => ({
              id: c.id,
              name: c.name || "",
              displayOrder: c.listOrder ?? 0,
              image: c.image || null,
              excludedBranches: c.excludedBranches,
              taxPercentage: c.taxPercentage,
            }))
          );

          // Cache meals for this branch
          await localDb.cacheMeals(
            branch.id,
            nextMeals.map((m: any) => ({
              id: m.id,
              categoryId: m.categoryId || "",
              name: m.name || "",
              sku: m.sku || null,
              listOrder: m.listOrder ?? 0,
              price: typeof m.basePrice === "string" ? parseFloat(m.basePrice) : (m.basePrice || 0),
              description: m.description || null,
              image: m.image || null,
              excludedBranches: m.excludedBranches,
              taxPercentage: m.taxPercentage,
              effectiveBasePrice: m.effectiveBasePrice,
              effectiveTaxPercentage: m.effectiveTaxPercentage,
              mealSizes: m.mealSizes?.map((s: any) => ({
                id: s.id,
                name: s.name,
                sizeType: s.sizeType,
                price: typeof s.price === "string" ? parseFloat(s.price) : s.price,
                taxPercentage: s.taxPercentage,
              })),
              mealAddOns: m.mealAddOns?.map((ao: any) => ({
                addOn: {
                  id: ao.addOn.id,
                  name: ao.addOn.name,
                  description: ao.addOn.description,
                  price: ao.addOn.price,
                  effectiveBasePrice: ao.addOn.effectiveBasePrice,
                  effectiveTaxPercentage: ao.addOn.effectiveTaxPercentage,
                  type: ao.addOn.type,
                  isActive: ao.addOn.isActive,
                  excludedBranches: ao.addOn.excludedBranches,
                  addonSizes: ao.addOn.addonSizes,
                },
              })),
              mealOptionalIngredients: m.mealOptionalIngredients,
              mealDeclarations: m.mealDeclarations,
              branchAvailabilities: (m as any).branchAvailabilities || (m as any).mealBranchAvailabilities || (m as any).mealBranchAvailability,
            })) as any[]
          );

        } catch (branchError) {
          console.error(`[SyncService] Failed prefetch for branch ${branch.id}:`, branchError);
        }
      }

      if (branchesToCache.length > 0) {
        await localDb.cacheBranches(branchesToCache);
      }


      // Debug: Dump SQLite contents to verify caching
      try {
        await localDb.debugDumpAllTables();
      } catch (e) {
        console.error("[SyncService] Failed to dump SQLite contents:", e);
      }
    } catch (error) {
      console.error("[SyncService] Failed to prefetch catalog for organization:", error);
    } finally {
      this.isPrefetching = false;
    }
  }

  public async syncOfflineOrders(): Promise<{ successCount: number; failedCount: number }> {
    if (this.isSyncing) {
      return { successCount: 0, failedCount: 0 };
    }

    if (!this.token) {
      return { successCount: 0, failedCount: 0 };
    }

    this.isSyncing = true; // Lock immediately before any async calls

    try {
      const localDb = LocalDbService.getInstance();
      const unsyncedOrders = await localDb.getUnsyncedOrders();

      if (unsyncedOrders.length === 0) {
        this.isSyncing = false;
        return { successCount: 0, failedCount: 0 };
      }

      let successCount = 0;
      let failedCount = 0;

      for (const order of unsyncedOrders) {
        try {
          const baseInput = JSON.parse(order.cartData) as CreatePosOrderInput;
          const { taxBreakdown, discountAmount, ...apiInput } = baseInput as any;
          
          // Prepare sync payload with original client UUID, sequential orderNumber, and original local timestamp
          const syncPayload = {
            ...apiInput,
            id: order.id,
            orderNumber: `OFFLINE-${order.offlineSequenceNumber}-${order.id.slice(-6).toUpperCase()}`,
            createdAt: order.createdAt,
          };

          await posOrderService.createPosOrder(syncPayload, this.token);
          await localDb.markOrderSynced(order.id);
          
          successCount++;
        } catch (error) {
          failedCount++;
        }
      }

      return { successCount, failedCount };
    } finally {
      this.isSyncing = false; // Always unlock when finished or if an error is thrown
    }
  }
}

export default SyncService;
