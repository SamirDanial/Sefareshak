import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type OrderType = "DELIVERY" | "PICKUP";

export type DeliveryInfoDraft = {
  address: string;
  streetAddress: string;
  postalCode: string;
  addressType: "HOUSE" | "BUILDING";
  houseNumber: string;
  building: string;
  floor: string;
  apartment: string;
  extraDetails: string;
  phone: string;
  notes: string;
};

export type PickupInfoDraft = {
  phone: string;
  notes: string;
};

export type DetailedAddressDraft = {
  fullAddress: string;
  streetAddress?: string;
  postalCode?: string;
  addressType?: "HOUSE" | "BUILDING";
  houseNumber?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  extraDetails?: string;
};

type CheckoutDraftState = {
  hasHydrated: boolean;

  orderType: OrderType;
  branchId: string | null;
  deliveryAvailabilityConfirmed: boolean;

  deliveryInfo: DeliveryInfoDraft;
  pickupInfo: PickupInfoDraft;
  detailedAddress: DetailedAddressDraft;
  deliveryDistance: number | null;

  setHasHydrated: (hasHydrated: boolean) => void;
  setOrderType: (orderType: OrderType) => void;
  setBranchId: (branchId: string | null) => void;
  setDeliveryAvailabilityConfirmed: (confirmed: boolean) => void;
  setDeliveryInfo: (patch: Partial<DeliveryInfoDraft>) => void;
  setPickupInfo: (patch: Partial<PickupInfoDraft>) => void;
  setDetailedAddress: (patch: Partial<DetailedAddressDraft>) => void;
  setDeliveryDistance: (distance: number | null) => void;
  clearDraft: () => Promise<void>;
};

const emptyDeliveryInfo: DeliveryInfoDraft = {
  address: "",
  streetAddress: "",
  postalCode: "",
  addressType: "HOUSE",
  houseNumber: "",
  building: "",
  floor: "",
  apartment: "",
  extraDetails: "",
  phone: "",
  notes: "",
};

const emptyPickupInfo: PickupInfoDraft = {
  phone: "",
  notes: "",
};

const emptyDetailedAddress: DetailedAddressDraft = {
  fullAddress: "",
};

export const useCheckoutDraftStore = create<CheckoutDraftState>()(
  persist(
    (set) => ({
      hasHydrated: false,

      orderType: "DELIVERY",
      branchId: null,
      deliveryAvailabilityConfirmed: false,

      deliveryInfo: emptyDeliveryInfo,
      pickupInfo: emptyPickupInfo,
      detailedAddress: emptyDetailedAddress,
      deliveryDistance: null,

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setOrderType: (orderType) => set({ orderType }),
      setBranchId: (branchId) => set({ branchId }),
      setDeliveryAvailabilityConfirmed: (deliveryAvailabilityConfirmed) =>
        set({ deliveryAvailabilityConfirmed }),
      setDeliveryInfo: (patch) =>
        set((state) => ({
          deliveryInfo: { ...state.deliveryInfo, ...patch },
        })),
      setPickupInfo: (patch) =>
        set((state) => ({
          pickupInfo: { ...state.pickupInfo, ...patch },
        })),
      setDetailedAddress: (patch) =>
        set((state) => ({
          detailedAddress: { ...state.detailedAddress, ...patch },
        })),
      setDeliveryDistance: (deliveryDistance) => set({ deliveryDistance }),

      clearDraft: async () => {
        set({
          orderType: "DELIVERY",
          branchId: null,
          deliveryAvailabilityConfirmed: false,
          deliveryInfo: emptyDeliveryInfo,
          pickupInfo: emptyPickupInfo,
          detailedAddress: emptyDetailedAddress,
          deliveryDistance: null,
        });

        try {
          await AsyncStorage.removeItem("checkout-draft-storage");
        } catch {
          // ignore
        }
      },
    }),
    {
      name: "checkout-draft-storage",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        orderType: state.orderType,
        branchId: state.branchId,
        deliveryAvailabilityConfirmed: state.deliveryAvailabilityConfirmed,
        deliveryInfo: state.deliveryInfo,
        pickupInfo: state.pickupInfo,
        detailedAddress: state.detailedAddress,
        deliveryDistance: state.deliveryDistance,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
