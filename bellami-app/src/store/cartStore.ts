import { create } from "zustand";

export interface OptionalIngredient {
  id: string;
  name: string;
  isIncluded: boolean; // true = included, false = excluded
}

export type CartItemType = "MEAL" | "DEAL";

export interface CartItem {
  id: string;
  itemType?: CartItemType;
  mealId?: string;
  dealId?: string;
  mealName: string;
  mealImage: string;
  sizeId?: string;
  sizeName?: string;
  quantity: number;
  basePrice: number;
  sizePrice: number;
  addOns: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    sizeType?: "S" | "M" | "L" | "XL";
  }[];
  dealComponents?: {
    id?: string;
    name?: string;
    price: number;
    taxPercentage: number;
    quantity: number;
  }[];
  optionalIngredients?: OptionalIngredient[]; // Optional ingredients with inclusion status
  specialInstructions: string;
  totalPrice: number;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateItemQuantity: (id: string, quantity: number) => void;
  replaceItem: (id: string, item: CartItem) => void;
  getItemById: (id: string) => CartItem | undefined;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],

  addItem: (item: CartItem) => {
    set((state) => {
      const existingItemIndex = state.items.findIndex((i) => i.id === item.id);

      if (existingItemIndex >= 0) {
        // Update existing item
        const updatedItems = [...state.items];
        const existingItem = updatedItems[existingItemIndex];
        const newQuantity = existingItem.quantity + item.quantity;
        // Calculate unit price from the new item being added
        const unitPrice = item.totalPrice / item.quantity;
        // Recalculate totalPrice with combined quantity
        updatedItems[existingItemIndex] = {
          ...item,
          quantity: newQuantity,
          totalPrice: unitPrice * newQuantity,
        };
        return { items: updatedItems };
      } else {
        // Add new item
        return { items: [...state.items, item] };
      }
    });
  },

  removeItem: (id: string) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    }));
  },

  updateItemQuantity: (id: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(id);
      return;
    }

    set((state) => ({
      items: state.items.map((item) => {
        if (item.id === id) {
          // Calculate unit price from current totalPrice and quantity
          const unitPrice = item.totalPrice / item.quantity;
          // Recalculate totalPrice with new quantity
          return { ...item, quantity, totalPrice: unitPrice * quantity };
        }
        return item;
      }),
    }));
  },

  replaceItem: (id: string, item: CartItem) => {
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? item : i)),
    }));
  },

  getItemById: (id: string) => {
    return get().items.find((i) => i.id === id);
  },

  clearCart: () => {
    set({ items: [] });
  },

  getTotalItems: () => {
    return get().items.reduce((total, item) => total + item.quantity, 0);
  },

  getTotalPrice: () => {
    return get().items.reduce((total, item) => total + item.totalPrice, 0);
  },
}));
