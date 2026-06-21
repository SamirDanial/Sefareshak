import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface OptionalIngredient {
  id: string;
  name: string;
  isIncluded: boolean; // true = included, false = excluded
}

export type CartItemType = "MEAL" | "DEAL";

export interface CartItem {
  id: string;
  itemType?: CartItemType;
  mealId?: string; // Add the actual meal ID
  dealId?: string;
  name: string;
  basePrice: number;
  size?: string;
  addOns: AddOn[];
  optionalIngredients?: OptionalIngredient[]; // Optional ingredients with inclusion status
  specialInstructions: string;
  image: string;
  quantity: number;
}

export interface AddOn {
  id: string;
  name: string;
  price: number;
  type: "BOOLEAN" | "QUANTITY"; // Addon type
  quantity?: number; // Optional quantity for quantity-based addons
  sizeType?: "S" | "M" | "L" | "XL"; // Addon size type (if applicable)
}

export interface Meal {
  id: string;
  name: string;
  price: number;
  img: string;
  description: string;
  sizes: {
    small: number;
    medium: number;
    large: number;
  };
  addOns: AddOn[];
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem, maxOrderQuantity?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (
    id: string,
    quantity: number,
    maxOrderQuantity?: number
  ) => void;
  replaceItem: (id: string, item: CartItem) => void;
  getItemById: (id: string) => CartItem | undefined;
  clearCart: () => void;
  getTotalPrice: () => number;
  getItemCount: () => number;
  getTotalItemCount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item, maxOrderQuantity) => {
        const currentTotalItems = get().getTotalItemCount();
        const maxQuantity = maxOrderQuantity || 10; // Default to 10 if not provided

        // Check if adding this item would exceed the max order quantity
        if (currentTotalItems + item.quantity > maxQuantity) {
          throw new Error(
            `Cannot add ${item.quantity} items. Maximum order quantity is ${maxQuantity}. You currently have ${currentTotalItems} items in your cart.`
          );
        }

        const existingItem = get().items.find((i) => {
          const itemTypeA = i.itemType || "MEAL";
          const itemTypeB = item.itemType || "MEAL";
          if (itemTypeA !== itemTypeB) return false;

          if (itemTypeA === "MEAL") {
            if ((i.mealId || "") !== (item.mealId || "")) return false;
          }
          if (itemTypeA === "DEAL") {
            if ((i.dealId || "") !== (item.dealId || "")) return false;
          }

          return (
            i.size === item.size &&
            JSON.stringify(i.addOns) === JSON.stringify(item.addOns) &&
            JSON.stringify(i.optionalIngredients) === JSON.stringify(item.optionalIngredients) &&
            i.specialInstructions === item.specialInstructions
          );
        });

        if (existingItem) {
          // Check if updating existing item would exceed max quantity
          const newQuantity = existingItem.quantity + item.quantity;
          if (newQuantity > maxQuantity) {
            throw new Error(
              `Cannot add ${item.quantity} more items. Maximum order quantity is ${maxQuantity}. You currently have ${currentTotalItems} items in your cart.`
            );
          }

          set((state) => ({
            items: state.items.map((i) =>
              i.id === existingItem.id ? { ...i, quantity: newQuantity } : i
            ),
          }));
        } else {
          set((state) => ({ items: [...state.items, item] }));
        }
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      updateQuantity: (id, quantity, maxOrderQuantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }

        const maxQuantity = maxOrderQuantity || 10; // Default to 10 if not provided
        const currentItem = get().items.find((item) => item.id === id);

        if (currentItem) {
          const currentTotalItems = get().getTotalItemCount();
          const quantityDifference = quantity - currentItem.quantity;

          // Check if updating would exceed max quantity
          if (currentTotalItems + quantityDifference > maxQuantity) {
            throw new Error(
              `Cannot set quantity to ${quantity}. Maximum order quantity is ${maxQuantity}. You currently have ${currentTotalItems} items in your cart.`
            );
          }
        }

        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, quantity } : item
          ),
        }));
      },

      replaceItem: (id, item) => {
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? item : i)),
        }));
      },

      getItemById: (id) => {
        return get().items.find((i) => i.id === id);
      },

      clearCart: () => {
        set({ items: [] });
      },

      getTotalPrice: () => {
        return get().items.reduce((total, item) => {
          const sizePrice = item.basePrice;
          const addOnPrice = item.addOns.reduce((sum, addOn) => {
            const addOnQuantity = addOn.quantity || 1; // Default to 1 if no quantity specified
            return sum + addOn.price * addOnQuantity;
          }, 0);
          return total + (sizePrice + addOnPrice) * item.quantity;
        }, 0);
      },

      getItemCount: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },

      getTotalItemCount: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },
    }),
    {
      name: "cart-storage", // unique name for localStorage key
      version: 1, // version for future migrations if needed
    }
  )
);
