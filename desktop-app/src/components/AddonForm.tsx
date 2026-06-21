import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import {
  addonService,
  type Addon,
  type AddonBranchPrice,
  type AddonFormData,
} from "../services/addonService";
import { categoryService, type Category } from "../services/categoryService";
import branchService, { type Branch } from "../services/branchService";
import BranchSearchSelect from "./BranchSearchSelect";
import ImageUpload from "./ImageUpload";

interface AddonFormProps {
  isOpen: boolean;
  onClose: () => void;
  addon?: Addon | null;
  onSuccess: () => void;
}

type SearchSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SearchSelectProps = {
  options: SearchSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  noResultsText?: string;
  buttonWidth?: number | string;
};

const SearchSelect: React.FC<SearchSelectProps> = ({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  disabled,
  searchPlaceholder = "Search...",
  noResultsText = "No results",
  buttonWidth = "100%",
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => (o.label || "").toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (!open) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => {
            const next = !v;
            if (!next) setQuery("");
            return next;
          });
        }}
        style={{
          width: buttonWidth,
          height: "40px",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "0 12px",
          fontSize: "14px",
          color: "#111827",
          backgroundColor: disabled ? "#f9fafb" : "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: selected ? "#111827" : "#6b7280",
          }}
        >
          {selected?.label || placeholder}
        </span>
        <span style={{ opacity: 0.6, flexShrink: 0 }}>▾</span>
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "10px",
            padding: "8px",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
            zIndex: 50,
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
            style={{
              width: "100%",
              height: "32px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "0 10px",
              fontSize: "12px",
              outline: "none",
            }}
          />

          <div
            style={{
              marginTop: "8px",
              maxHeight: "240px",
              overflowY: "auto",
              border: "1px solid #f3f4f6",
              borderRadius: "8px",
            }}
          >
            {filtered.length === 0 ? (
              <div style={{ padding: "10px", fontSize: "12px", color: "#6b7280" }}>{noResultsText}</div>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      onValueChange(opt.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      border: "none",
                      backgroundColor: isSelected ? "#f9fafb" : "transparent",
                      cursor: opt.disabled ? "not-allowed" : "pointer",
                      textAlign: "left",
                      opacity: opt.disabled ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (opt.disabled) return;
                      e.currentTarget.style.backgroundColor = "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isSelected
                        ? "#f9fafb"
                        : "transparent";
                    }}
                  >
                    <span style={{ width: "16px", flexShrink: 0 }}>{isSelected ? "✓" : ""}</span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const AddonForm: React.FC<AddonFormProps> = ({
  isOpen,
  onClose,
  addon,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny } = usePermissions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchPrices, setBranchPrices] = useState<AddonBranchPrice[]>([]);
  const [loadingBranchPrices, setLoadingBranchPrices] = useState(false);
  const [editingBranchPrice, setEditingBranchPrice] = useState<{
    branchId: string;
    basePrice: string;
    taxPercentage: string;
  } | null>(null);
  const [branchPriceToDelete, setBranchPriceToDelete] = useState<{
    branchId: string;
    branchName: string;
  } | null>(null);
  const [showDeleteBranchPriceDialog, setShowDeleteBranchPriceDialog] = useState(false);
  const [priceInput, setPriceInput] = useState<string>("");
  const [sizePriceInputs, setSizePriceInputs] = useState<Record<number, string>>({});
  const [taxInput, setTaxInput] = useState<string>("");
  const [sizeTaxInputs, setSizeTaxInputs] = useState<Record<number, string>>({});
  const [formData, setFormData] = useState<AddonFormData>({
    name: "",
    description: "",
    price: 0,
    sizes: [],
    taxPercentage: null,
    image: "",
    type: "BOOLEAN",
    excludedBranches: [],
    isActive: true,
    categoryIds: [],
  });

  const canCreateAddon = canAny([{ resource: RESOURCES.ADDONS, action: ACTIONS.CREATE }]);
  const canUpdateAddon = canAny([{ resource: RESOURCES.ADDONS, action: ACTIONS.UPDATE }]);
  const canDeleteAddon = canAny([{ resource: RESOURCES.ADDONS, action: ACTIONS.DELETE }]);
  const canSubmit = addon ? canUpdateAddon : canCreateAddon;

  const loadBranches = async () => {
    try {
      setBranchesLoading(true);
      const token = await getToken();
      if (!token) {
        setBranches([]);
        return;
      }
      const data = await branchService.getAdminBranches(token);
      setBranches(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load branches:", error);
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  };

  const loadBranchPrices = async (addonId: string) => {
    try {
      setLoadingBranchPrices(true);
      const token = await getToken();
      if (!token) {
        setBranchPrices([]);
        return;
      }
      const prices = await addonService.getAddonBranchPrices(addonId, token);
      setBranchPrices(Array.isArray(prices) ? prices : []);
    } catch (error) {
      console.error("Failed to load branch prices:", error);
      setBranchPrices([]);
    } finally {
      setLoadingBranchPrices(false);
    }
  };

  // Helper function to safely parse price
  const parsePrice = (price: string | number): number => {
    if (typeof price === "number") return price;
    if (typeof price === "string") {
      const parsed = parseFloat(price);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  // Format number to string, removing unnecessary decimal places and floating-point errors
  const formatNumberForInput = (num: number): string => {
    // Round to 10 decimal places to handle floating-point errors
    const rounded = Math.round(num * 10000000000) / 10000000000;
    // If exactly 0, return "0"
    if (rounded === 0) return "0";
    // Convert to string and remove trailing zeros and decimal point if not needed
    return rounded.toString().replace(/\.?0+$/, "");
  };

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setCategoriesLoading(true);
        const token = await getToken();
        const response = await categoryService.getCategories(
          1,
          100,
          "",
          "name",
          "asc",
          token || undefined
        );
        setCategories(response.categories);
      } catch (error) {
        console.error("Error fetching categories:", error);
      } finally {
        setCategoriesLoading(false);
      }
    };

    if (isOpen) {
      fetchCategories();
      loadBranches();
    }
  }, [isOpen, getToken]);

  useEffect(() => {
    if (!isOpen) return;
    if (!addon?.id) return;
    loadBranchPrices(addon.id);
  }, [isOpen, addon?.id]);

  // Reset form when dialog opens/closes or addon changes
  useEffect(() => {
    if (isOpen) {
      if (addon) {
        // Edit mode - fetch full addon with sizes
        const loadAddonData = async () => {
          try {
            const token = await getToken();
            const fullAddon = await addonService.getAddonById(addon.id, token || undefined);
            const basePrice = parsePrice(fullAddon.price || "0");
            
            const sizes = fullAddon.addonSizes?.map((size) => {
              // Calculate additional price: stored price - base price
              const storedPrice = parsePrice(size.price);
              const additionalPrice = storedPrice - basePrice;
              // Round to avoid floating-point errors (round to 10 decimal places)
              const roundedPrice = Math.round(additionalPrice * 10000000000) / 10000000000;
              return {
                sizeType: size.sizeType,
                price: roundedPrice, // Additional price on top of base
                taxPercentage: size.taxPercentage || null,
              };
            }) || [];
            
            setFormData({
              name: fullAddon.name,
              description: fullAddon.description || "",
              price: basePrice, // Base price
              sizes: sizes,
              taxPercentage: fullAddon.taxPercentage,
              image: fullAddon.image || "",
              type: fullAddon.type,
              excludedBranches: fullAddon.excludedBranches || [],
              isActive: fullAddon.isActive,
              categoryIds: fullAddon.addonCategories?.map(ac => ac.category.id) || [],
            });
            setPriceInput(formatNumberForInput(basePrice));
            
            // Initialize size price and tax inputs
            const sizePriceInputs: Record<number, string> = {};
            const sizeTaxInputs: Record<number, string> = {};
            sizes.forEach((size, idx) => {
              sizePriceInputs[idx] = formatNumberForInput(size.price);
              sizeTaxInputs[idx] = size.taxPercentage !== null && size.taxPercentage !== undefined 
                ? formatNumberForInput(size.taxPercentage) 
                : "";
            });
            setSizePriceInputs(sizePriceInputs);
            setSizeTaxInputs(sizeTaxInputs);
            
            // Initialize main tax input
            setTaxInput(fullAddon.taxPercentage !== null && fullAddon.taxPercentage !== undefined
              ? formatNumberForInput(fullAddon.taxPercentage)
              : "");
          } catch (error) {
            console.error("Error loading addon:", error);
            // Fallback to basic addon data if fetch fails
            const price = typeof addon.price === "string" ? parseFloat(addon.price) : (addon.price ?? 0);
            const finalPrice = isNaN(price) ? 0 : price;
            setFormData({
              name: addon.name,
              description: addon.description || "",
              price: finalPrice,
              sizes: [],
              taxPercentage: addon.taxPercentage,
              image: addon.image || "",
              type: addon.type,
              excludedBranches: addon.excludedBranches || [],
              isActive: addon.isActive,
              categoryIds: addon.addonCategories?.map(ac => ac.category.id) || [],
            });
            setPriceInput(finalPrice === 0 ? "" : finalPrice.toString());
            setSizePriceInputs({});
            setSizeTaxInputs({});
            setTaxInput("");
          }
        };
        loadAddonData();
      } else {
        // Create mode - reset to defaults
        setFormData({
          name: "",
          description: "",
          price: 0,
          sizes: [],
          taxPercentage: null,
          image: "",
          type: "BOOLEAN",
          excludedBranches: [],
          isActive: true,
          categoryIds: [],
        });
        setPriceInput("");
        setSizePriceInputs({});
        setSizeTaxInputs({});
        setTaxInput("");
      }
    }
  }, [isOpen, addon, getToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) {
      alert(t("admin.dashboard.noPermission"));
      return;
    }
    
    // Validate base price
    if (!formData.price || formData.price < 0) {
      alert(t("admin.addonManagement.addonForm.basePriceRequiredError"));
      return;
    }
    
    // Validate that at least one size is configured
    if (!formData.sizes || formData.sizes.length === 0) {
      alert(t("admin.addonManagement.addonForm.atLeastOneSizeError"));
      return;
    }

    // Validate and normalize sizes (convert undefined to 0)
    const normalizedSizes = formData.sizes.map(size => ({
      ...size,
      price: size.price ?? 0,
    }));

    // Check if any size has invalid price (allow 0 as valid)
    if (normalizedSizes.some(size => size.price < 0 || (size.price !== 0 && isNaN(size.price)))) {
      alert(t("admin.addonManagement.addonForm.sizePricesInvalidError"));
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      const submitData = {
        ...formData,
        sizes: normalizedSizes,
      };

      if (addon) {
        // Update existing addon
        await addonService.updateAddon(
          addon.id,
          submitData,
          token || undefined
        );
      } else {
        // Create new addon
        await addonService.createAddon(submitData, token || undefined);
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error saving addon:", error);
      alert(error?.message || t("admin.addonManagement.addonForm.saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const toggleCategory = (categoryId: string) => {
    setFormData(prev => {
      const currentIds = prev.categoryIds || [];
      if (currentIds.includes(categoryId)) {
        return {
          ...prev,
          categoryIds: currentIds.filter(id => id !== categoryId),
        };
      } else {
        return {
          ...prev,
          categoryIds: [...currentIds, categoryId],
        };
      }
    });
  };

  const toggleExcludedBranch = (branchId: string) => {
    const current = formData.excludedBranches || [];
    const next = current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId];
    setFormData({ ...formData, excludedBranches: next });
  };

  const handleSaveBranchPrice = async () => {
    if (!addon?.id) return;
    if (!editingBranchPrice) return;
    if (!canUpdateAddon) return;

    try {
      const token = await getToken();
      if (!token) return;
      const basePrice = parseFloat(editingBranchPrice.basePrice);
      if (isNaN(basePrice) || basePrice < 0) {
        alert(t("admin.addonManagement.addonForm.branchPriceEnterValid"));
        return;
      }
      await addonService.upsertAddonBranchPrice(
        addon.id,
        {
          branchId: editingBranchPrice.branchId,
          basePrice,
          taxPercentage: editingBranchPrice.taxPercentage
            ? parseFloat(editingBranchPrice.taxPercentage)
            : null,
        },
        token
      );
      await loadBranchPrices(addon.id);
      setEditingBranchPrice(null);
    } catch (error) {
      console.error("Failed to save branch price:", error);
      alert(t("admin.addonManagement.addonForm.branchPriceSaveFailed"));
    }
  };

  const handleDeleteBranchPrice = async () => {
    if (!addon?.id) return;
    if (!branchPriceToDelete) return;
    if (!canDeleteAddon) return;

    try {
      const token = await getToken();
      if (!token) return;
      await addonService.deleteAddonBranchPrice(addon.id, branchPriceToDelete.branchId, token);
      await loadBranchPrices(addon.id);
      setShowDeleteBranchPriceDialog(false);
      setBranchPriceToDelete(null);
    } catch (error) {
      console.error("Failed to delete branch price:", error);
      alert(t("admin.addonManagement.addonForm.branchPriceDeleteFailed"));
    }
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Allow empty string
    if (value === "") {
      setPriceInput("");
      setFormData({
        ...formData,
        price: 0,
      });
      return;
    }
    
    // Only allow numbers and one decimal point
    // Pattern: digits optionally followed by a dot and more digits
    const validPattern = /^\d*\.?\d*$/;
    
    if (validPattern.test(value)) {
      // Ensure only one decimal point
      const decimalCount = (value.match(/\./g) || []).length;
      if (decimalCount <= 1) {
        setPriceInput(value);
        setFormData({
          ...formData,
          price: parseFloat(value) || 0,
        });
      }
    }
  };

  // Handle tax percentage change
  const handleTaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTaxInput(value);
    
    if (value === "") {
      setFormData({ ...formData, taxPercentage: null });
      return;
    }
    
    // Only allow numbers and one decimal point
    const validPattern = /^\d*\.?\d*$/;
    
    if (validPattern.test(value)) {
      const decimalCount = (value.match(/\./g) || []).length;
      if (decimalCount <= 1) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
          setFormData({ ...formData, taxPercentage: numValue });
        }
      }
    }
  };

  // Handle size price change
  const handleSizePriceChange = (index: number, value: string) => {
    // Allow empty string
    if (value === "") {
      setSizePriceInputs(prev => ({ ...prev, [index]: "" }));
      updateSize(index, "price", 0);
      return;
    }
    
    // Only allow numbers (0-9) and one decimal point
    // Pattern: allows digits and optionally one decimal point
    // Examples: "0", "0.", "0.5", "5", "5.5", ".5"
    const validPattern = /^(\d+\.?\d*|\.\d+)$/;
    
    // Check if value matches pattern and has at most one decimal point
    const decimalCount = (value.match(/\./g) || []).length;
    
    if (validPattern.test(value) && decimalCount <= 1) {
      // Update the input state
      setSizePriceInputs(prev => ({ ...prev, [index]: value }));
      
      // Parse and update the numeric value
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        updateSize(index, "price", numValue);
      } else if (value === "0" || value === "0.") {
        // Explicitly handle 0
        updateSize(index, "price", 0);
      }
    }
    // If pattern doesn't match, don't update the input (reject invalid characters)
  };

  // Handle size tax percentage change
  const handleSizeTaxChange = (index: number, value: string) => {
    // Allow empty string
    if (value === "") {
      setSizeTaxInputs(prev => ({ ...prev, [index]: "" }));
      updateSize(index, "taxPercentage", null);
      return;
    }
    
    // Only allow numbers (0-9) and one decimal point
    // Pattern: allows digits and optionally one decimal point
    // Examples: "0", "0.", "0.5", "5", "5.5", ".5"
    const validPattern = /^(\d+\.?\d*|\.\d+)$/;
    
    // Check if value matches pattern and has at most one decimal point
    const decimalCount = (value.match(/\./g) || []).length;
    
    if (validPattern.test(value) && decimalCount <= 1) {
      // Update the input state
      setSizeTaxInputs(prev => ({ ...prev, [index]: value }));
      
      // Parse and update the numeric value
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
        updateSize(index, "taxPercentage", numValue);
      } else if (value === "0" || value === "0.") {
        // Explicitly handle 0
        updateSize(index, "taxPercentage", 0);
      }
    }
    // If pattern doesn't match, don't update the input (reject invalid characters)
  };

  // Size management functions
  const addSize = () => {
    const availableSizes: ("S" | "M" | "L" | "XL")[] = ["S", "M", "L", "XL"];
    const usedSizes = formData.sizes?.map(s => s.sizeType) || [];
    const nextSize = availableSizes.find(size => !usedSizes.includes(size));
    
    if (nextSize) {
      const newIndex = formData.sizes?.length || 0;
      const newSizes = [
        ...(formData.sizes || []),
        { sizeType: nextSize, price: 0, taxPercentage: null },
      ];
      setFormData({ ...formData, sizes: newSizes });
      // Initialize empty inputs for new size
      setSizePriceInputs(prev => ({ ...prev, [newIndex]: "" }));
      setSizeTaxInputs(prev => ({ ...prev, [newIndex]: "" }));
    }
  };

  const removeSize = (index: number) => {
    const newSizes = formData.sizes?.filter((_, i) => i !== index) || [];
    setFormData({ ...formData, sizes: newSizes });
    // Remove the input state for this size and reindex
    const newPriceInputs: Record<number, string> = {};
    const newTaxInputs: Record<number, string> = {};
    formData.sizes?.forEach((_, i) => {
      if (i < index) {
        newPriceInputs[i] = sizePriceInputs[i] || "";
        newTaxInputs[i] = sizeTaxInputs[i] || "";
      } else if (i > index) {
        newPriceInputs[i - 1] = sizePriceInputs[i] || "";
        newTaxInputs[i - 1] = sizeTaxInputs[i] || "";
      }
    });
    setSizePriceInputs(newPriceInputs);
    setSizeTaxInputs(newTaxInputs);
  };

  const updateSize = (
    index: number,
    field: "sizeType" | "price" | "taxPercentage",
    value: string | number | null
  ) => {
    const newSizes = [...(formData.sizes || [])];
    newSizes[index] = { ...newSizes[index], [field]: value };
    setFormData({ ...formData, sizes: newSizes });
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "24px",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "700px",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "24px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: "600",
                color: "#ec4899",
                margin: 0,
                marginBottom: "4px",
              }}
            >
              {addon ? t("admin.addonManagement.addonForm.editTitle") : t("admin.addonManagement.addonForm.createTitle")}
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "#6b7280",
                margin: 0,
              }}
            >
              {addon
                ? t("admin.addonManagement.addonForm.editDescription")
                : t("admin.addonManagement.addonForm.createDescription")}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            style={{
              padding: "8px",
              border: "none",
              borderRadius: "6px",
              backgroundColor: "transparent",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: isSubmitting ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.backgroundColor = "#f3f4f6";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            <X style={{ height: "20px", width: "20px", color: "#6b7280" }} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Addon Name */}
            <div>
              <label
                htmlFor="name"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {t("admin.addonManagement.addonForm.addonNameRequired")}
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("admin.addonManagement.addonForm.addonNamePlaceholder")}
                required
                disabled={isSubmitting}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: isSubmitting ? "#f9fafb" : "#ffffff",
                  color: "#111827",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#ec4899";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {t("admin.addonManagement.addonForm.description")}
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("admin.addonManagement.addonForm.descriptionPlaceholder")}
                rows={3}
                disabled={isSubmitting}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  backgroundColor: isSubmitting ? "#f9fafb" : "#ffffff",
                  color: "#111827",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#ec4899";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Price and Type Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {/* Price */}
              <div>
                <label
                  htmlFor="price"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.addonManagement.addonForm.basePriceRequired")}
                </label>
                <input
                  id="price"
                  type="text"
                  value={priceInput}
                  onChange={handlePriceChange}
                  placeholder={t("admin.addonManagement.addonForm.basePricePlaceholder")}
                  required
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                    backgroundColor: isSubmitting ? "#f9fafb" : "#ffffff",
                    color: "#111827",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              {/* Type */}
              <div>
                <label
                  htmlFor="type"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.addonManagement.addonForm.typeRequired")}
                </label>
                <SearchSelect
                  options={[
                    { value: "BOOLEAN", label: t("admin.addonManagement.addonForm.typeBoolean") },
                    { value: "QUANTITY", label: t("admin.addonManagement.addonForm.typeQuantity") },
                  ]}
                  value={formData.type}
                  onValueChange={(next) => setFormData({ ...formData, type: next as "BOOLEAN" | "QUANTITY" })}
                  placeholder={t("admin.addonManagement.addonForm.typeRequired")}
                  disabled={isSubmitting}
                  searchPlaceholder={t("common.search")}
                  noResultsText={t("common.noResults")}
                />
              </div>
            </div>

            {/* Sizes Section */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    margin: 0,
                  }}
                >
                  {t("admin.addonManagement.addonForm.sizesRequired")}
                </label>
                <button
                  type="button"
                  onClick={addSize}
                  disabled={isSubmitting || (formData.sizes?.length || 0) >= 4}
                  style={{
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: "500",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    backgroundColor: (formData.sizes?.length || 0) >= 4 ? "#f9fafb" : "#ffffff",
                    color: (formData.sizes?.length || 0) >= 4 ? "#9ca3af" : "#111827",
                    cursor: (formData.sizes?.length || 0) >= 4 || isSubmitting ? "not-allowed" : "pointer",
                    opacity: isSubmitting ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting && (formData.sizes?.length || 0) < 4) {
                      e.currentTarget.style.backgroundColor = "#f9fafb";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmitting && (formData.sizes?.length || 0) < 4) {
                      e.currentTarget.style.backgroundColor = "#ffffff";
                    }
                  }}
                >
                  {t("admin.addonManagement.addonForm.addSize")}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {formData.sizes?.map((size, index) => (
                  <div
                    key={index}
                    style={{
                      padding: "12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      backgroundColor: "#f9fafb",
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
                      <div style={{ width: "92px" }}>
                        <SearchSelect
                          options={(["S", "M", "L", "XL"] as const).map((sizeOption) => {
                            const isUsed = formData.sizes?.some(
                              (s, i) => s.sizeType === sizeOption && i !== index
                            );
                            return {
                              value: sizeOption,
                              label: sizeOption,
                              disabled: isUsed,
                            };
                          })}
                          value={size.sizeType}
                          onValueChange={(next) => updateSize(index, "sizeType", next as "S" | "M" | "L" | "XL")}
                          placeholder={t("common.select")}
                          disabled={isSubmitting}
                          searchPlaceholder={t("common.search")}
                          noResultsText={t("common.noResults")}
                          buttonWidth={"92px"}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={sizePriceInputs[index] || ""}
                          onChange={(e) => handleSizePriceChange(index, e.target.value)}
                          placeholder={t("admin.addonManagement.addonForm.additionalPricePlaceholder")}
                          disabled={isSubmitting}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: "14px",
                            border: "1px solid #e5e7eb",
                            borderRadius: "6px",
                            outline: "none",
                            backgroundColor: isSubmitting ? "#f3f4f6" : "#ffffff",
                            color: "#111827",
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = "#ec4899";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = "#e5e7eb";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          padding: "0 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t("admin.addonManagement.addonForm.total")} ${(formData.price + (size.price ?? 0)).toFixed(2)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSize(index)}
                        disabled={isSubmitting}
                        style={{
                          padding: "8px",
                          border: "none",
                          borderRadius: "6px",
                          backgroundColor: "transparent",
                          cursor: isSubmitting ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: isSubmitting ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSubmitting) {
                            e.currentTarget.style.backgroundColor = "#fee2e2";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSubmitting) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <X style={{ height: "16px", width: "16px", color: "#dc2626" }} />
                      </button>
                    </div>
                    <div>
                      <input
                        type="text"
                        value={sizeTaxInputs[index] || ""}
                        onChange={(e) => handleSizeTaxChange(index, e.target.value)}
                        placeholder={t("admin.addonManagement.addonForm.taxRatePlaceholder")}
                        disabled={isSubmitting}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          fontSize: "14px",
                          border: "1px solid #e5e7eb",
                          borderRadius: "6px",
                          outline: "none",
                          backgroundColor: isSubmitting ? "#f3f4f6" : "#ffffff",
                          color: "#111827",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "#ec4899";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "#e5e7eb";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      />
                    </div>
                  </div>
                ))}
                {(!formData.sizes || formData.sizes.length === 0) && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      textAlign: "center",
                      padding: "16px",
                      margin: 0,
                    }}
                  >
                    {t("admin.addonManagement.addonForm.noSizesAdded")}
                  </p>
                )}
              </div>
            </div>

            {/* Tax Percentage */}
            <div>
              <label
                htmlFor="taxPercentage"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {t("admin.addonManagement.addonForm.taxPercentage")}
              </label>
              <input
                id="taxPercentage"
                type="text"
                value={taxInput}
                onChange={handleTaxChange}
                placeholder={t("admin.addonManagement.addonForm.taxPercentagePlaceholder")}
                disabled={isSubmitting}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: isSubmitting ? "#f9fafb" : "#ffffff",
                  color: "#111827",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#ec4899";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <p
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  margin: "6px 0 0 0",
                }}
              >
                {t("admin.addonManagement.addonForm.taxPercentageHint")}
              </p>
            </div>

            {/* Addon Image */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {t("admin.addonManagement.addonForm.addonImage")}
              </label>
              <ImageUpload
                value={formData.image}
                onChange={(value) => setFormData({ ...formData, image: value })}
                disabled={isSubmitting}
              />
            </div>

            {/* Categories */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {t("admin.addonManagement.addonForm.categories")}
              </label>
              <div
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  padding: "12px",
                  backgroundColor: isSubmitting ? "#f9fafb" : "#ffffff",
                }}
              >
                {categoriesLoading ? (
                  <p style={{ fontSize: "14px", color: "#6b7280", textAlign: "center", padding: "20px" }}>
                    {t("admin.addonManagement.addonForm.loadingCategories")}
                  </p>
                ) : categories.length === 0 ? (
                  <p style={{ fontSize: "14px", color: "#6b7280", textAlign: "center", padding: "20px" }}>
                    {t("admin.addonManagement.addonForm.noCategoriesAvailable")}
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {categories.map((category) => (
                      <label
                        key={category.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px",
                          borderRadius: "6px",
                          cursor: isSubmitting ? "not-allowed" : "pointer",
                          backgroundColor: (formData.categoryIds || []).includes(category.id)
                            ? "#fce7f3"
                            : "transparent",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSubmitting) {
                            e.currentTarget.style.backgroundColor = "#f9fafb";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSubmitting) {
                            e.currentTarget.style.backgroundColor = (formData.categoryIds || []).includes(category.id)
                              ? "#fce7f3"
                              : "transparent";
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={(formData.categoryIds || []).includes(category.id)}
                          onChange={() => toggleCategory(category.id)}
                          disabled={isSubmitting}
                          style={{
                            width: "18px",
                            height: "18px",
                            cursor: isSubmitting ? "not-allowed" : "pointer",
                            accentColor: "#ec4899",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "14px",
                            color: "#111827",
                            flex: 1,
                          }}
                        >
                          {category.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  margin: "6px 0 0 0",
                }}
              >
                {t("admin.addonManagement.addonForm.categoriesHint")}
              </p>
            </div>

            {/* Excluded Branches */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {t("admin.addonManagement.addonForm.excludedBranches")}
              </label>
              <p style={{ fontSize: "12px", color: "#6b7280", marginTop: 0, marginBottom: "10px" }}>
                {t("admin.addonManagement.addonForm.excludedBranchesDescription")}
              </p>

              <div
                style={{
                  maxHeight: "220px",
                  overflowY: "auto",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "8px",
                  backgroundColor: "#ffffff",
                }}
              >
                {branchesLoading ? (
                  <div style={{ fontSize: "12px", color: "#6b7280", padding: "10px" }}>
                    {t("common.loading")}
                  </div>
                ) : branches.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "#6b7280", padding: "10px" }}>
                    {t("admin.addonManagement.addonForm.noBranchesAvailable")}
                  </div>
                ) : (
                  branches.map((branch) => {
                    const checked = (formData.excludedBranches || []).includes(branch.id);
                    return (
                      <label
                        key={branch.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                          padding: "10px 12px",
                          borderRadius: "10px",
                          cursor: isSubmitting ? "not-allowed" : "pointer",
                          opacity: isSubmitting ? 0.7 : 1,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isSubmitting}
                            onChange={() => toggleExcludedBranch(branch.id)}
                          />
                          <span style={{ fontSize: "13px", color: "#111827", fontWeight: 600 }}>
                            {branch.name}
                          </span>
                        </div>
                        {checked ? (
                          <span style={{ fontSize: "12px", color: "#ec4899", fontWeight: 700 }}>
                            {t("admin.addonManagement.addonForm.excluded")}
                          </span>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Branch-Specific Prices */}
            {addon?.id && (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                    marginBottom: "8px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#111827",
                        marginBottom: "4px",
                      }}
                    >
                      {t("admin.addonManagement.addonForm.branchPricesTitle")}
                    </label>
                    <p style={{ fontSize: "12px", color: "#6b7280", margin: 0 }}>
                      {t("admin.addonManagement.addonForm.branchPricesDescription")}
                    </p>
                  </div>

                  {canUpdateAddon && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingBranchPrice({
                          branchId: "",
                          basePrice: String(formData.price ?? 0),
                          taxPercentage:
                            formData.taxPercentage !== null && formData.taxPercentage !== undefined
                              ? String(formData.taxPercentage)
                              : "",
                        })
                      }
                      disabled={isSubmitting}
                      style={{
                        padding: "8px 12px",
                        fontSize: "12px",
                        fontWeight: "600",
                        border: "none",
                        borderRadius: "8px",
                        backgroundColor: "#ec4899",
                        color: "#ffffff",
                        cursor: isSubmitting ? "not-allowed" : "pointer",
                        opacity: isSubmitting ? 0.7 : 1,
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSubmitting) e.currentTarget.style.backgroundColor = "#db2777";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSubmitting) e.currentTarget.style.backgroundColor = "#ec4899";
                      }}
                    >
                      {t("admin.addonManagement.addonForm.addBranchPrice")}
                    </button>
                  )}
                </div>

                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "12px",
                    backgroundColor: "#ffffff",
                  }}
                >
                  {loadingBranchPrices ? (
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>
                      {t("admin.addonManagement.addonForm.branchPricesLoading")}
                    </div>
                  ) : branchPrices.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>
                      {t("admin.addonManagement.addonForm.branchPricesEmpty")}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {branchPrices.map((bp) => (
                        <div
                          key={bp.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "10px",
                            padding: "10px",
                            border: "1px solid #e5e7eb",
                            borderRadius: "10px",
                            backgroundColor: "#f9fafb",
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>
                              {bp.branch.name}
                            </div>
                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#6b7280" }}>
                              {t("admin.addonManagement.addonForm.branchPriceLabel", {
                                price: `$${Number.parseFloat(bp.basePrice).toFixed(2)}`,
                              })}
                              {bp.taxPercentage !== null && bp.taxPercentage !== undefined
                                ? ` • ${t("admin.addonManagement.addonForm.branchTaxLabel", {
                                    tax: bp.taxPercentage,
                                  })}`
                                : ""}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {canUpdateAddon && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingBranchPrice({
                                    branchId: bp.branchId,
                                    basePrice: bp.basePrice,
                                    taxPercentage:
                                      bp.taxPercentage !== null && bp.taxPercentage !== undefined
                                        ? String(bp.taxPercentage)
                                        : "",
                                  })
                                }
                                disabled={isSubmitting}
                                style={{
                                  padding: "6px 10px",
                                  fontSize: "12px",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: "8px",
                                  backgroundColor: "#ffffff",
                                  cursor: isSubmitting ? "not-allowed" : "pointer",
                                }}
                              >
                                {t("common.edit")}
                              </button>
                            )}
                            {canDeleteAddon && (
                              <button
                                type="button"
                                onClick={() => {
                                  setBranchPriceToDelete({
                                    branchId: bp.branchId,
                                    branchName: bp.branch.name,
                                  });
                                  setShowDeleteBranchPriceDialog(true);
                                }}
                                disabled={isSubmitting}
                                style={{
                                  padding: "6px 10px",
                                  fontSize: "12px",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: "8px",
                                  backgroundColor: "#ffffff",
                                  cursor: isSubmitting ? "not-allowed" : "pointer",
                                  color: "#dc2626",
                                }}
                              >
                                {t("common.delete")}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {editingBranchPrice && (
                  <div
                    style={{
                      marginTop: "12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "12px",
                      padding: "12px",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>
                        {t(
                          editingBranchPrice.branchId
                            ? "admin.addonManagement.addonForm.editBranchPrice"
                            : "admin.addonManagement.addonForm.addBranchPrice"
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingBranchPrice(null)}
                        style={{
                          border: "none",
                          backgroundColor: "transparent",
                          cursor: "pointer",
                          color: "#6b7280",
                          padding: 0,
                        }}
                      >
                        {t("common.close")}
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "10px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#111827", marginBottom: "6px" }}>
                          {t("admin.addonManagement.addonForm.branch")}
                        </label>
                        <BranchSearchSelect
                          branches={branches.filter(
                            (b) =>
                              !branchPrices.find(
                                (bp) =>
                                  bp.branchId === b.id &&
                                  bp.branchId !== editingBranchPrice.branchId
                              )
                          )}
                          value={editingBranchPrice.branchId}
                          onValueChange={(value) =>
                            setEditingBranchPrice({
                              ...editingBranchPrice,
                              branchId: value,
                            })
                          }
                          placeholder={t("admin.addonManagement.addonForm.selectBranch")}
                          disabled={isSubmitting}
                          searchPlaceholder={t("admin.addonManagement.addonForm.searchBranches", {
                            defaultValue: "Search branches...",
                          })}
                          noResultsText={t("admin.addonManagement.addonForm.noBranchesFound", {
                            defaultValue: "No branches found",
                          })}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#111827", marginBottom: "6px" }}>
                          {t("admin.addonManagement.addonForm.branchPriceBasePrice")}
                        </label>
                        <input
                          type="text"
                          value={editingBranchPrice.basePrice}
                          onChange={(e) =>
                            setEditingBranchPrice({
                              ...editingBranchPrice,
                              basePrice: e.target.value,
                            })
                          }
                          placeholder="0.00"
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            fontSize: "14px",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            outline: "none",
                            backgroundColor: "#ffffff",
                            color: "#111827",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: "12px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#111827", marginBottom: "6px" }}>
                        {t("admin.addonManagement.addonForm.branchPriceTax")}
                      </label>
                      <input
                        type="text"
                        value={editingBranchPrice.taxPercentage}
                        onChange={(e) =>
                          setEditingBranchPrice({
                            ...editingBranchPrice,
                            taxPercentage: e.target.value,
                          })
                        }
                        placeholder="8.5"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          fontSize: "14px",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          outline: "none",
                          backgroundColor: "#ffffff",
                          color: "#111827",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                      <button
                        type="button"
                        onClick={() => setEditingBranchPrice(null)}
                        style={{
                          padding: "8px 14px",
                          fontSize: "12px",
                          fontWeight: 600,
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          backgroundColor: "#ffffff",
                          cursor: "pointer",
                        }}
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveBranchPrice}
                        disabled={!editingBranchPrice.branchId || !editingBranchPrice.basePrice}
                        style={{
                          padding: "8px 14px",
                          fontSize: "12px",
                          fontWeight: 600,
                          border: "none",
                          borderRadius: "8px",
                          backgroundColor: "#ec4899",
                          color: "#ffffff",
                          cursor:
                            !editingBranchPrice.branchId || !editingBranchPrice.basePrice
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            !editingBranchPrice.branchId || !editingBranchPrice.basePrice ? 0.6 : 1,
                        }}
                      >
                        {t("common.save")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Is Active */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px",
                backgroundColor: "#f9fafb",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
              }}
            >
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                disabled={isSubmitting}
                style={{
                  width: "18px",
                  height: "18px",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  accentColor: "#ec4899",
                }}
              />
              <label
                htmlFor="isActive"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  margin: 0,
                }}
              >
                {t("admin.addonManagement.addonForm.makeActive")}
              </label>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              padding: "20px 24px",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "500",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: "#ffffff",
                color: "#111827",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                opacity: isSubmitting ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }
              }}
            >
              {t("admin.addonManagement.addonForm.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !canSubmit}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "500",
                border: "none",
                borderRadius: "8px",
                backgroundColor: isSubmitting ? "#d1d5db" : "#ec4899",
                color: "#ffffff",
                cursor: isSubmitting || !canSubmit ? "not-allowed" : "pointer",
                opacity: isSubmitting || !canSubmit ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting && canSubmit) {
                  e.currentTarget.style.backgroundColor = "#db2777";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting && canSubmit) {
                  e.currentTarget.style.backgroundColor = "#ec4899";
                }
              }}
            >
              {isSubmitting && (
                <Loader2
                  style={{
                    height: "16px",
                    width: "16px",
                    animation: "spin 1s linear infinite",
                  }}
                />
              )}
              {isSubmitting
                ? addon
                  ? t("admin.addonManagement.addonForm.updating")
                  : t("admin.addonManagement.addonForm.creating")
                : addon
                ? t("admin.addonManagement.addonForm.updateAddon")
                : t("admin.addonManagement.addonForm.createAddon")}
            </button>
          </div>
        </form>

        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>

      {/* Delete Branch Price Confirmation */}
      {showDeleteBranchPriceDialog && branchPriceToDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
          }}
          onClick={() => {
            setShowDeleteBranchPriceDialog(false);
            setBranchPriceToDelete(null);
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "420px",
              width: "90%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", margin: 0 }}>
              {t("admin.addonManagement.addonForm.deleteBranchPriceTitle")}
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "10px" }}>
              {t("admin.addonManagement.addonForm.deleteBranchPriceDescription", {
                branchName: branchPriceToDelete.branchName,
              })}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteBranchPriceDialog(false);
                  setBranchPriceToDelete(null);
                }}
                style={{
                  padding: "8px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleDeleteBranchPrice}
                style={{
                  padding: "8px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  cursor: "pointer",
                }}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddonForm;

