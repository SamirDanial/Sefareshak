import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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

type CheckoutDraftState = {
  orderType: OrderType;
  branchId: string | null;
  deliveryAvailabilityConfirmed: boolean;
  deliveryInfo: DeliveryInfoDraft;
  pickupInfo: PickupInfoDraft;
  deliveryDistance: number | null;

  setOrderType: (orderType: OrderType) => void;
  setBranchId: (branchId: string | null) => void;
  setDeliveryAvailabilityConfirmed: (confirmed: boolean) => void;
  setDeliveryInfo: (patch: Partial<DeliveryInfoDraft>) => void;
  setPickupInfo: (patch: Partial<PickupInfoDraft>) => void;
  setDeliveryDistance: (distance: number | null) => void;
  clearDraft: () => void;
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

export const useCheckoutDraftStore = create<CheckoutDraftState>()(
  persist(
    (set) => ({
      orderType: "DELIVERY",
      branchId: null,
      deliveryAvailabilityConfirmed: false,
      deliveryInfo: emptyDeliveryInfo,
      pickupInfo: emptyPickupInfo,
      deliveryDistance: null,

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
      setDeliveryDistance: (deliveryDistance) => set({ deliveryDistance }),

      clearDraft: () => {
        set({
          orderType: "DELIVERY",
          branchId: null,
          deliveryAvailabilityConfirmed: false,
          deliveryInfo: emptyDeliveryInfo,
          pickupInfo: emptyPickupInfo,
          deliveryDistance: null,
        });
        try {
          sessionStorage.removeItem("checkout-draft-storage");
        } catch {
          // ignore
        }
      },
    }),
    {
      name: "checkout-draft-storage",
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<CheckoutDraftState>) || {};
        return {
          ...currentState,
          ...persisted,
          deliveryInfo: {
            ...(currentState as CheckoutDraftState).deliveryInfo,
            ...(persisted as any).deliveryInfo,
          },
          pickupInfo: {
            ...(currentState as CheckoutDraftState).pickupInfo,
            ...(persisted as any).pickupInfo,
          },
        } as CheckoutDraftState;
      },
      partialize: (state) => ({
        orderType: state.orderType,
        branchId: state.branchId,
        deliveryAvailabilityConfirmed: state.deliveryAvailabilityConfirmed,
        deliveryInfo: state.deliveryInfo,
        pickupInfo: state.pickupInfo,
        deliveryDistance: state.deliveryDistance,
      }),
    }
  )
);
