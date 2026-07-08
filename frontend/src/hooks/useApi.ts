import { useState, useEffect } from "react";
import ApiService from "@/services/apiService";

export interface Category {
  id: string;
  name: string;
  nameFa?: string | null;
  description: string | null;
  descriptionFa?: string | null;
  image: string | null;
  isActive: boolean;
  isFeatured: boolean;
  featuredOrder?: number | null;
  listOrder?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealComponent {
  id: string;
  name: string;
  nameFa?: string | null;
  price: string;
  taxPercentage: string;
  effectivePrice?: number;
  effectiveTaxPercentage?: number;
}

export interface Deal {
  id: string;
  name: string;
  nameFa?: string | null;
  description: string | null;
  descriptionFa?: string | null;
  image: string | null;
  isActive: boolean;
  isFeatured?: boolean;
  featuredOrder?: number | null;
  listOrder?: number | null;
  categoryId: string;
  excludedBranches?: string[];
  createdAt: string;
  updatedAt: string;
  category?: Category;
  components?: DealComponent[];
}

export interface DealCategory extends Category {
  deals?: Deal[];
}

export interface MealAddOn {
  id: string;
  mealId: string;
  addOnId: string;
  addOn: {
    id: string;
    name: string;
    nameFa?: string | null;
    price: string;
    type: string;
    image: string | null;
    description: string | null;
    descriptionFa?: string | null;
  };
}

export interface MealDeclaration {
  id: string;
  mealId: string;
  declarationId: string;
  declaration: {
    id: string;
    name: string;
    nameFa?: string | null;
    type: string | null;
    description: string | null;
    descriptionFa?: string | null;
    icon: string | null;
  };
}

export interface Meal {
  id: string;
  name: string;
  nameFa?: string | null;
  description: string | null;
  descriptionFa?: string | null;
  basePrice: string;
  image: string | null;
  isActive: boolean;
  isFeatured?: boolean;
  featuredOrder?: number | null;
  listOrder?: number | null;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
  category: Category;
  mealSizes: MealSize[];
  mealAddOns: MealAddOn[];
  mealDeclarations?: MealDeclaration[];
  // Branch-specific pricing (when branchId is provided in query)
  effectiveBasePrice?: number;
}

export interface MealSize {
  id: string;
  name: string;
  nameFa?: string | null;
  price: string;
  mealId: string;
}

export interface OptionalIngredient {
  id: string;
  name: string;
  nameFa?: string | null;
  description: string | null;
  descriptionFa?: string | null;
  createdAt: string;
  updatedAt: string;
}
const sortCategoriesByOrder = (data: Category[], featured?: boolean) => {
  return [...data].sort((a, b) => {
    const orderAValue = featured ? a.featuredOrder : a.listOrder;
    const orderBValue = featured ? b.featuredOrder : b.listOrder;
    const orderA =
      typeof orderAValue === "number" && orderAValue > 0
        ? orderAValue
        : Number.MAX_SAFE_INTEGER;
    const orderB =
      typeof orderBValue === "number" && orderBValue > 0
        ? orderBValue
        : Number.MAX_SAFE_INTEGER;

    if (orderA === orderB) {
      return a.name.localeCompare(b.name);
    }
    return orderA - orderB;
  });
};

export function useCategories(featured?: boolean, branchId?: string) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCategories([]);
  }, [branchId]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        setError(null);
        const apiService = ApiService.getInstance();
        const response = await apiService.getCategories(featured, branchId);

        if (response.success) {
          setCategories(sortCategoriesByOrder(response.data, featured));
        } else {
          setError("Failed to fetch categories");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Error fetching categories:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [featured, branchId]);

  return { categories, loading, error };
}

export function useMeals(params?: {
  categoryId?: string;
  search?: string;
  featured?: boolean;
  branchId?: string;
}) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMeals([]);
  }, [params?.branchId]);

  useEffect(() => {
    const fetchMeals = async () => {
      try {
        setLoading(true);
        setError(null);
        const apiService = ApiService.getInstance();
        const response = await apiService.getMeals(params);

        if (response.success) {
          setMeals(response.data);
        } else {
          setError("Failed to fetch meals");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Error fetching meals:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMeals();
  }, [params?.categoryId, params?.search, params?.featured, params?.branchId]);

  return { meals, loading, error };
}

export function useCategory(categoryId: string, branchId?: string) {
  const [category, setCategory] = useState<Category | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategory = async () => {
      try {
        setLoading(true);
        setError(null);
        const apiService = ApiService.getInstance();
        const response = await apiService.getCategory(categoryId, branchId);

        if (response.success) {
          setCategory(response.data);
          setMeals(response.data.meals || []);
        } else {
          setError("Failed to fetch category");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Error fetching category:", err);
      } finally {
        setLoading(false);
      }
    };

    if (categoryId) {
      fetchCategory();
    }
  }, [categoryId, branchId]);

  return { category, meals, loading, error };
}

export function useDealCategories(featured?: boolean, branchId?: string) {
  const [categories, setCategories] = useState<DealCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDealCategories = async () => {
      try {
        setLoading(true);
        setError(null);
        const apiService = ApiService.getInstance();
        const response = await apiService.getDealCategories(featured, branchId);

        if (response.success) {
          setCategories(sortCategoriesByOrder(response.data, featured) as any);
        } else {
          setError("Failed to fetch deal categories");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Error fetching deal categories:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDealCategories();
  }, [featured, branchId]);

  return { categories, loading, error };
}

export function useDealCategory(categoryId: string, branchId?: string) {
  const [category, setCategory] = useState<DealCategory | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDealCategory = async () => {
      try {
        setLoading(true);
        setError(null);
        const apiService = ApiService.getInstance();
        const response = await apiService.getDealCategory(categoryId, branchId);

        if (response.success) {
          setCategory(response.data);
          setDeals(response.data.deals || []);
        } else {
          setError("Failed to fetch deal category");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Error fetching deal category:", err);
      } finally {
        setLoading(false);
      }
    };

    if (categoryId) {
      fetchDealCategory();
    }
  }, [categoryId, branchId]);

  return { category, deals, loading, error };
}
