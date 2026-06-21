import { Branch, Settings } from "@prisma/client";

/**
 * Get a branch setting with inheritance fallback to main branch.
 * If the branch value is null/undefined, use the main branch value.
 */
export function getBranchSetting<T extends keyof Branch>(
  branch: Branch,
  settingName: T,
  mainBranch: Branch
): Branch[T] {
  const value = branch[settingName];
  if (value !== null && value !== undefined) {
    return value;
  }
  return mainBranch[settingName];
}

/**
 * Future order settings with global settings fallback
 */
export interface FutureOrderSettings {
  futureOrdersEnabled: boolean;
  enableFuturePickupOrders: boolean;
  futurePickupOrderDays: number;
  enableFutureDeliveryOrders: boolean;
  futureDeliveryOrderDays: number;
}

export interface DeliverySettings {
  deliveryEnabled: boolean;
  deliveryRadius: number | null;
}

/**
 * Get effective delivery settings for a branch with inheritance from organization settings.
 * Branch settings override org settings when not null.
 */
export function getEffectiveDeliverySettings(
  branch: Branch | null,
  orgSettings: Settings
): DeliverySettings {
  const deliveryEnabled =
    (branch as any)?.deliveryEnabled !== null && (branch as any)?.deliveryEnabled !== undefined
      ? Boolean((branch as any).deliveryEnabled)
      : Boolean((orgSettings as any).deliveryEnabled);

  const deliveryRadiusRaw = (branch as any)?.deliveryRadius;
  const deliveryRadius =
    deliveryRadiusRaw !== null && deliveryRadiusRaw !== undefined
      ? Number(deliveryRadiusRaw)
      : (orgSettings as any).deliveryRadius !== null && (orgSettings as any).deliveryRadius !== undefined
      ? Number((orgSettings as any).deliveryRadius)
      : null;

  return {
    deliveryEnabled,
    deliveryRadius: Number.isFinite(deliveryRadius) ? deliveryRadius : null,
  };
}

/**
 * Get effective future order settings for a branch with inheritance from global settings.
 * Branch settings override global settings when not null.
 */
export function getEffectiveFutureOrderSettings(
  branch: Branch | null,
  globalSettings: Settings
): FutureOrderSettings {
  return {
    futureOrdersEnabled:
      branch?.futureOrdersEnabled !== null && branch?.futureOrdersEnabled !== undefined
        ? branch.futureOrdersEnabled
        : globalSettings.futureOrdersEnabled,
    enableFuturePickupOrders:
      branch?.enableFuturePickupOrders !== null && branch?.enableFuturePickupOrders !== undefined
        ? branch.enableFuturePickupOrders
        : globalSettings.enableFuturePickupOrders,
    futurePickupOrderDays:
      branch?.futurePickupOrderDays !== null && branch?.futurePickupOrderDays !== undefined
        ? branch.futurePickupOrderDays
        : globalSettings.futurePickupOrderDays,
    enableFutureDeliveryOrders:
      branch?.enableFutureDeliveryOrders !== null && branch?.enableFutureDeliveryOrders !== undefined
        ? branch.enableFutureDeliveryOrders
        : globalSettings.enableFutureDeliveryOrders,
    futureDeliveryOrderDays:
      branch?.futureDeliveryOrderDays !== null && branch?.futureDeliveryOrderDays !== undefined
        ? branch.futureDeliveryOrderDays
        : globalSettings.futureDeliveryOrderDays,
  };
}

/**
 * Validate a scheduled date against future order settings
 */
export function validateScheduledDate(
  scheduledDate: Date | null,
  orderType: "PICKUP" | "DELIVERY",
  futureOrderSettings: FutureOrderSettings
): { valid: boolean; error?: string } {
  // ASAP orders are always valid
  if (!scheduledDate) {
    return { valid: true };
  }

  // If future order scheduling is disabled globally (or via branch override), disallow all scheduled orders.
  if (!futureOrderSettings.futureOrdersEnabled) {
    return {
      valid: false,
      error: "Future order scheduling is disabled",
    };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const scheduledStartOfDay = new Date(
    scheduledDate.getFullYear(),
    scheduledDate.getMonth(),
    scheduledDate.getDate()
  );

  // Check if scheduled date is in the past
  if (scheduledDate < now) {
    return { valid: false, error: "Cannot schedule orders in the past" };
  }

  // Get the appropriate settings based on order type
  const enabled =
    orderType === "PICKUP"
      ? futureOrderSettings.enableFuturePickupOrders
      : futureOrderSettings.enableFutureDeliveryOrders;

  const maxDays =
    orderType === "PICKUP"
      ? futureOrderSettings.futurePickupOrderDays
      : futureOrderSettings.futureDeliveryOrderDays;

  // If future orders are not enabled, only allow orders for today
  if (!enabled) {
    if (scheduledStartOfDay.getTime() > startOfToday.getTime()) {
      return {
        valid: false,
        error: `Future ${orderType.toLowerCase()} orders are not enabled`,
      };
    }
    return { valid: true };
  }

  // Calculate days difference
  const diffTime = scheduledStartOfDay.getTime() - startOfToday.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > maxDays) {
    return {
      valid: false,
      error: `Cannot schedule ${orderType.toLowerCase()} orders more than ${maxDays} days in advance`,
    };
  }

  return { valid: true };
}

/**
 * Scheduled order merge settings with global settings fallback
 */
export interface ScheduledOrderMergeSettings {
  allowScheduledOrderMerge: boolean;
  scheduledOrderMergeCutoffHours: number;
}

/**
 * Scheduled order capacity settings with global settings fallback
 */
export interface ScheduledOrderCapacitySettings {
  /**
   * Max orders per time slot. null means unlimited.
   */
  scheduledOrderMaxOrdersPerSlot: number | null;
}

/**
 * Get effective scheduled order capacity settings for a branch with inheritance from global settings.
 * Branch setting overrides global when not null.
 */
export function getEffectiveScheduledOrderCapacitySettings(
  branch: Branch | null,
  globalSettings: Settings
): ScheduledOrderCapacitySettings {
  return {
    scheduledOrderMaxOrdersPerSlot:
      branch?.scheduledOrderMaxOrdersPerSlot !== null &&
      branch?.scheduledOrderMaxOrdersPerSlot !== undefined
        ? branch.scheduledOrderMaxOrdersPerSlot
        : globalSettings.scheduledOrderMaxOrdersPerSlot ?? null,
  };
}

/**
 * Get effective scheduled order merge settings for a branch with inheritance from global settings.
 * Branch settings override global settings when not null.
 */
export function getEffectiveScheduledOrderMergeSettings(
  branch: Branch | null,
  globalSettings: Settings
): ScheduledOrderMergeSettings {
  return {
    allowScheduledOrderMerge:
      branch?.allowScheduledOrderMerge !== null && branch?.allowScheduledOrderMerge !== undefined
        ? branch.allowScheduledOrderMerge
        : globalSettings.allowScheduledOrderMerge,
    scheduledOrderMergeCutoffHours:
      branch?.scheduledOrderMergeCutoffHours !== null && branch?.scheduledOrderMergeCutoffHours !== undefined
        ? branch.scheduledOrderMergeCutoffHours
        : globalSettings.scheduledOrderMergeCutoffHours,
  };
}

/**
 * Validate if two orders can be merged based on their scheduled status
 * @param existingOrder The existing order to merge into
 * @param newOrderScheduledDate The scheduled date of the new order (null for ASAP)
 * @param mergeSettings The effective merge settings
 * @returns Validation result with error message if invalid
 */
export function validateScheduledOrderMerge(
  existingOrder: { scheduledDate: Date | null; isScheduledOrder: boolean },
  newOrderScheduledDate: Date | null,
  mergeSettings: ScheduledOrderMergeSettings
): { valid: boolean; error?: string } {
  const existingIsScheduled = existingOrder.isScheduledOrder && existingOrder.scheduledDate;
  const newIsScheduled = newOrderScheduledDate !== null;

  // If neither order is scheduled, use standard ASAP merge logic (handled elsewhere)
  if (!existingIsScheduled && !newIsScheduled) {
    return { valid: true };
  }

  // Cannot mix ASAP and scheduled orders
  if (existingIsScheduled && !newIsScheduled) {
    return {
      valid: false,
      error: "Cannot merge an ASAP order with a scheduled order",
    };
  }

  if (!existingIsScheduled && newIsScheduled) {
    return {
      valid: false,
      error: "Cannot merge a scheduled order with an ASAP order",
    };
  }

  // Both orders are scheduled - check if merge is allowed
  if (!mergeSettings.allowScheduledOrderMerge) {
    return {
      valid: false,
      error: "Merging scheduled orders is not enabled",
    };
  }

  // Check if scheduled for the same date and time (within 30 minutes tolerance)
  const existingScheduledDate = existingOrder.scheduledDate!;
  const timeDiff = Math.abs(existingScheduledDate.getTime() - newOrderScheduledDate!.getTime());
  const thirtyMinutesMs = 30 * 60 * 1000;

  if (timeDiff > thirtyMinutesMs) {
    return {
      valid: false,
      error: "Can only merge orders scheduled for the same time slot",
    };
  }

  // Check if we're within the cutoff period
  const now = new Date();
  const cutoffTime = new Date(
    existingScheduledDate.getTime() - mergeSettings.scheduledOrderMergeCutoffHours * 60 * 60 * 1000
  );

  if (now >= cutoffTime) {
    return {
      valid: false,
      error: `Cannot merge scheduled orders within ${mergeSettings.scheduledOrderMergeCutoffHours} hours of the scheduled time`,
    };
  }

  return { valid: true };
}

