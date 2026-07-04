import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Icon from "@mdi/react";
import { mdiPlus, mdiMagnify, mdiDotsVertical, mdiPencil, mdiDelete, mdiEye, mdiEyeOff, mdiChevronLeft, mdiChevronRight, mdiRefresh, mdiClose } from "@mdi/js";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { addonService } from "@/services/addonService";
import type { Addon, AddonFormData, AddonBranchPrice } from "@/services/addonService";
import { categoryService } from "@/services/categoryService";
import type { Category } from "@/services/categoryService";
import branchService, { type Branch, type Organization } from "@/services/branchService";
import ImageUpload from "@/components/ui/image-upload";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { useTranslation } from "react-i18next";
import PriceInput from "@/components/ui/PriceInput";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import OrganizationSearchSelect from "@/components/OrganizationSearchSelect";
import { toast } from "sonner";

const AddonManagement: React.FC = () => {
  const { getToken } = useAuth();
  const { currency } = useSettings();
  const { t } = useTranslation();
  const { canAny, isSuperAdmin } = usePermissions();

  const canCreateAddon = canAny([
    { resource: RESOURCES.ADDONS, action: ACTIONS.CREATE },
  ]);
  const canUpdateAddon = canAny([
    { resource: RESOURCES.ADDONS, action: ACTIONS.UPDATE },
  ]);
  const canDeleteAddon = canAny([
    { resource: RESOURCES.ADDONS, action: ACTIONS.DELETE },
  ]);
  const canToggleAddon = canAny([
    { resource: RESOURCES.ADDONS, action: ACTIONS.TOGGLE_ACTIVE },
  ]);

  const canManageAddonActions =
    canUpdateAddon || canToggleAddon || canDeleteAddon || isSuperAdmin;

  // Helper function to safely parse price
  const parsePrice = (price: string | number): number => {
    if (typeof price === "number") return price;
    if (typeof price === "string") {
      const parsed = parseFloat(price);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const toggleSelectedAddon = (id: string, checked: boolean) => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const setAllSelectedAddonsOnPage = (checked: boolean) => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        addons.forEach((a) => next.add(a.id));
      } else {
        addons.forEach((a) => next.delete(a.id));
      }
      return next;
    });
  };

  const openBulkMoveAddons = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setBulkTargetOrganizationId("");
      setBulkMoveDialogOpen(true);
    } catch (e: any) {
      console.error("Failed to load organizations:", e);
    }
  };

  const openBulkCopyAddons = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setBulkCopyTargetOrganizationId("");
      setBulkCopyDialogOpen(true);
    } catch (e: any) {
      console.error("Failed to load organizations:", e);
    }
  };

  const handleBulkMoveAddons = async () => {
    const ids = Array.from(selectedAddonIds);
    if (ids.length === 0) return;
    if (!bulkTargetOrganizationId) {
      toast.error(
        t("admin.addonManagement.selectOrganization", {
          defaultValue: "Select an organization",
        })
      );
      return;
    }

    setBulkMoving(true);
    try {
      const token = await getToken();
      if (!token) return;

      const results = await Promise.allSettled(
        ids.map((id) =>
          addonService.setAddonOrganization(
            id,
            bulkTargetOrganizationId,
            token || undefined
          )
        )
      );

      const failedCount = results.filter((r) => r.status === "rejected").length;
      if (failedCount > 0) {
        toast.error(
          t("admin.addonManagement.bulkMoveFailed", {
            defaultValue: "Some addons failed to move",
          })
        );
      } else {
        toast.success(
          t("admin.addonManagement.bulkMoved", {
            defaultValue: "Addons moved",
          })
        );
      }

      setBulkMoveDialogOpen(false);
      setSelectedAddonIds(new Set());
      await fetchAddons();
    } finally {
      setBulkMoving(false);
    }
  };

  const handleBulkCopyAddons = async () => {
    const ids = Array.from(selectedAddonIds);
    if (ids.length === 0) return;
    if (!bulkCopyTargetOrganizationId) {
      toast.error(
        t("admin.addonManagement.selectOrganization", {
          defaultValue: "Select an organization",
        })
      );
      return;
    }

    setBulkCopying(true);
    try {
      const token = await getToken();
      if (!token) return;

      await addonService.copyAddonsToOrganization(
        ids,
        bulkCopyTargetOrganizationId,
        token || undefined
      );

      toast.success(
        t("admin.addonManagement.bulkCopied", {
          defaultValue: "Addons copied",
        })
      );

      setBulkCopyDialogOpen(false);
      setSelectedAddonIds(new Set());
      await fetchAddons();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t("admin.addonManagement.bulkCopyFailed", {
            defaultValue: "Some addons failed to copy",
          })
      );
    } finally {
      setBulkCopying(false);
    }
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
  const [addons, setAddons] = useState<Addon[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedActiveStatus, setSelectedActiveStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<"name" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [openAddonMenuId, setOpenAddonMenuId] = useState<string | null>(null);

  const handleSort = (field: "name" | "createdAt") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteBranchPriceDialogOpen, setIsDeleteBranchPriceDialogOpen] = useState(false);
  const [addonToDelete, setAddonToDelete] = useState<Addon | null>(null);
  const [branchPriceToDelete, setBranchPriceToDelete] = useState<{ addonId: string; branchId: string; branchName: string } | null>(null);
  const [selectedAddon, setSelectedAddon] = useState<Addon | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Branch prices state
  const [branchPrices, setBranchPrices] = useState<AddonBranchPrice[]>([]);
  const [loadingBranchPrices, setLoadingBranchPrices] = useState(false);
  const [editingBranchPrice, setEditingBranchPrice] = useState<{
    branchId: string;
    basePrice: string;
    taxPercentage: string;
  } | null>(null);

  // Move to organization states
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [addonToMove, setAddonToMove] = useState<Addon | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [targetOrganizationId, setTargetOrganizationId] = useState<string>("");
  const [moving, setMoving] = useState(false);

  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(
    new Set()
  );
  const [bulkMoveDialogOpen, setBulkMoveDialogOpen] = useState(false);
  const [bulkTargetOrganizationId, setBulkTargetOrganizationId] = useState<string>(
    ""
  );
  const [bulkMoving, setBulkMoving] = useState(false);

  const [bulkCopyDialogOpen, setBulkCopyDialogOpen] = useState(false);
  const [bulkCopyTargetOrganizationId, setBulkCopyTargetOrganizationId] = useState<string>(
    ""
  );
  const [bulkCopying, setBulkCopying] = useState(false);

  // Form states
  const [priceInput, setPriceInput] = useState<string>("");
  const [sizePriceInputs, setSizePriceInputs] = useState<Record<number, string>>({});
  const [taxInput, setTaxInput] = useState<string>("");
  const [sizeTaxInputs, setSizeTaxInputs] = useState<Record<number, string>>({});
  const [formData, setFormData] = useState<AddonFormData>({
    name: "",
    nameFa: "",
    description: "",
    descriptionFa: "",
    price: 0, // Base price
    sizes: [], // Additional prices for each size
    taxPercentage: null,
    image: "",
    type: "BOOLEAN",
    excludedBranches: [],
    isActive: true,
    categoryIds: [],
  });

  // Fetch addons
  const fetchAddons = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const statusParam = selectedActiveStatus === "true" ? "ACTIVE" : selectedActiveStatus === "false" ? "INACTIVE" : "";
      const response = await addonService.getAddons(
        currentPage,
        10,
        searchTerm,
        sortBy,
        sortOrder,
        token || undefined,
        statusParam as "ACTIVE" | "INACTIVE" | ""
      );

      setAddons(response.addons);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error fetching addons:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch categories
  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true);
      const token = await getToken();
      const response = await categoryService.getCategories(
        1,
        100, // Get all categories
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

  useEffect(() => {
    fetchAddons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchTerm, sortBy, sortOrder, selectedActiveStatus]);

  useEffect(() => {
    fetchCategories();
  }, []);

  // Handle search
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };


  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate base price
    if (!formData.price || formData.price < 0) {
      alert(t("admin.addonManagement.basePriceRequired"));
      return;
    }
    
    // Validate that at least one size is configured
    if (!formData.sizes || formData.sizes.length === 0) {
      alert(t("admin.addonManagement.addAtLeastOneSize"));
      return;
    }

    // Validate and normalize sizes (convert undefined to 0)
    const normalizedSizes = formData.sizes.map(size => ({
      ...size,
      price: size.price ?? 0,
    }));

    // Check if any size has invalid price (allow 0 as valid)
    if (normalizedSizes.some(size => size.price < 0 || (size.price !== 0 && isNaN(size.price)))) {
      alert(t("admin.addonManagement.invalidSizePrices"));
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      const submitData = {
        ...formData,
        sizes: normalizedSizes,
      };

      if (selectedAddon) {
        // Update existing addon
        await addonService.updateAddon(
          selectedAddon.id,
          submitData,
          token || undefined
        );
      } else {
        // Create new addon
        await addonService.createAddon(submitData, token || undefined);
      }

      // Close dialogs and reset form
      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      resetForm();

      // Refresh addons list
      await fetchAddons();
    } catch (error) {
      console.error("Error saving addon:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open move addon dialog
  const openMoveAddon = async (addon: Addon) => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setAddonToMove(addon);
      setTargetOrganizationId(addon.organizationId || "");
      setMoveDialogOpen(true);
    } catch (e: any) {
      console.error("Failed to load organizations:", e);
    }
  };

  // Handle move addon
  const handleMoveAddon = async () => {
    if (!addonToMove) return;
    if (!targetOrganizationId) {
      return;
    }

    setMoving(true);
    try {
      const token = await getToken();
      await addonService.setAddonOrganization(
        addonToMove.id,
        targetOrganizationId,
        token || undefined
      );
      setMoveDialogOpen(false);
      setAddonToMove(null);
      await fetchAddons();
    } catch (e: any) {
      console.error("Failed to move addon:", e);
    } finally {
      setMoving(false);
    }
  };

  // Handle edit
  const handleEdit = async (addon: Addon) => {
    // Load branches when opening edit dialog
    try {
      const token = await getToken();
      const branchesData = await branchService.getBranches(token || undefined);
      setBranches(branchesData || []);
    } catch (error) {
      console.error("Failed to load branches", error);
    }
    
    setSelectedAddon(addon);
    try {
      const token = await getToken();
      // Fetch full addon with sizes
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
        nameFa: fullAddon.nameFa || "",
        description: fullAddon.description || "",
        descriptionFa: fullAddon.descriptionFa || "",
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
      
      setIsEditDialogOpen(true);
      
      // Load branch prices
      if (addon.id) {
        loadBranchPrices(addon.id);
      }
    } catch (error) {
      console.error("Error loading addon:", error);
    }
  };

  // Load branch prices for an addon
  const loadBranchPrices = async (addonId: string) => {
    try {
      setLoadingBranchPrices(true);
      const token = await getToken();
      const prices = await addonService.getAddonBranchPrices(addonId, token || undefined);
      setBranchPrices(prices);
    } catch (error) {
      console.error("Failed to load branch prices:", error);
      setBranchPrices([]);
    } finally {
      setLoadingBranchPrices(false);
    }
  };

  // Save branch price
  const handleSaveBranchPrice = async () => {
    if (!editingBranchPrice || !selectedAddon) return;
    
    try {
      const token = await getToken();
      const basePrice = parseFloat(editingBranchPrice.basePrice);
      if (isNaN(basePrice) || basePrice < 0) {
        alert("Please enter a valid price");
        return;
      }

      await addonService.upsertAddonBranchPrice(
        selectedAddon.id,
        {
          branchId: editingBranchPrice.branchId,
          basePrice: basePrice,
          taxPercentage: editingBranchPrice.taxPercentage 
            ? parseFloat(editingBranchPrice.taxPercentage) 
            : null,
        },
        token || undefined
      );

      // Reload branch prices
      await loadBranchPrices(selectedAddon.id);
      setEditingBranchPrice(null);
    } catch (error) {
      console.error("Failed to save branch price:", error);
      alert("Failed to save branch price");
    }
  };

  // Delete branch price
  const handleDeleteBranchPrice = async () => {
    if (!branchPriceToDelete) return;

    try {
      const token = await getToken();
      await addonService.deleteAddonBranchPrice(branchPriceToDelete.addonId, branchPriceToDelete.branchId, token || undefined);
      // Reload branch prices
      await loadBranchPrices(branchPriceToDelete.addonId);
      setIsDeleteBranchPriceDialogOpen(false);
      setBranchPriceToDelete(null);
    } catch (error) {
      console.error("Failed to delete branch price:", error);
      alert("Failed to delete branch price");
    }
  };

  const handleDeleteBranchPriceClick = (branchId: string, branchName: string) => {
    if (!selectedAddon) return;
    setBranchPriceToDelete({ addonId: selectedAddon.id, branchId, branchName });
    setIsDeleteBranchPriceDialogOpen(true);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!addonToDelete) return;
    try {
      const token = await getToken();
      await addonService.deleteAddon(addonToDelete.id, token || undefined);
      await fetchAddons();
      setIsDeleteDialogOpen(false);
      setAddonToDelete(null);
    } catch (error) {
      console.error("Error deleting addon:", error);
    }
  };

  const handleDeleteClick = (addon: Addon) => {
    setAddonToDelete(addon);
    setIsDeleteDialogOpen(true);
  };

  // Handle toggle status
  const handleToggleStatus = async (addon: Addon) => {
    try {
      const token = await getToken();
      await addonService.toggleAddonStatus(addon.id, token || undefined);
      await fetchAddons();
    } catch (error) {
      console.error("Error toggling addon status:", error);
    }
  };

  // Toggle excluded branch
  const toggleExcludedBranch = (branchId: string) => {
    const currentExcludedBranches = formData.excludedBranches || [];
    const newExcludedBranches = currentExcludedBranches.includes(branchId)
      ? currentExcludedBranches.filter((id) => id !== branchId)
      : [...currentExcludedBranches, branchId];
    setFormData({
      ...formData,
      excludedBranches: newExcludedBranches,
    });
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      nameFa: "",
      description: "",
      descriptionFa: "",
      price: 0, // Base price
      sizes: [], // Additional prices
      taxPercentage: null,
      image: "",
      type: "BOOLEAN",
      isActive: true,
      categoryIds: [],
      excludedBranches: [],
    });
    setPriceInput("");
    setSizePriceInputs({});
    setTaxInput("");
    setSizeTaxInputs({});
    setSelectedAddon(null);
  };


  // Handle size price change
  const handleSizePriceChange = (index: number, value: string) => {
    // Update the input state
    setSizePriceInputs(prev => ({ ...prev, [index]: value }));
    
    // Allow empty string
    if (value === "") {
      updateSize(index, "price", 0);
      return;
    }
    
    // Only allow numbers and one decimal point
    const validPattern = /^\d*\.?\d*$/;
    
    if (validPattern.test(value)) {
      // Ensure only one decimal point
      const decimalCount = (value.match(/\./g) || []).length;
      if (decimalCount <= 1) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0) {
          updateSize(index, "price", numValue);
        }
      }
    }
    // If pattern doesn't match, don't update the input (reject invalid characters)
  };

  // Handle tax percentage change
  const handleTaxChange = (value: string) => {
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

  // Handle size tax percentage change
  const handleSizeTaxChange = (index: number, value: string) => {
    // Update the input state
    setSizeTaxInputs(prev => ({ ...prev, [index]: value }));
    
    if (value === "") {
      updateSize(index, "taxPercentage", null);
      return;
    }
    
    // Only allow numbers and one decimal point
    const validPattern = /^\d*\.?\d*$/;
    
    if (validPattern.test(value)) {
      const decimalCount = (value.match(/\./g) || []).length;
      if (decimalCount <= 1) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
          updateSize(index, "taxPercentage", numValue);
        }
      }
    }
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

  // Handle create new
  const handleCreateNew = async () => {
    // Load branches when opening create dialog
    try {
      const token = await getToken();
      const branchesData = await branchService.getBranches(token || undefined);
      setBranches(branchesData || []);
    } catch (error) {
      console.error("Failed to load branches", error);
    }
    resetForm();
    setIsCreateDialogOpen(true);
  };

  if (loading && addons.length === 0) {
    return (
      <div className="space-y-4 pb-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-pink-500">
              {t("admin.addonManagement.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("admin.addonManagement.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              {t("admin.addonManagement.loading")}
            </span>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("admin.addonManagement.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleSearch(e.target.value)
                  }
                  className="pl-9 bg-transparent text-foreground border-border"
                />
              </div>

              {/* Filter Dropdowns */}
              <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
                <Select
                  value={selectedActiveStatus || "all"}
                  onValueChange={(value: string) => {
                    setSelectedActiveStatus(value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue placeholder={t("admin.addonManagement.allStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("admin.addonManagement.allStatus")}</SelectItem>
                    <SelectItem value="true">{t("admin.addonManagement.active")}</SelectItem>
                    <SelectItem value="false">{t("admin.addonManagement.inactive")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">{t("admin.addonManagement.sortBy")}:</span>
                <Button
                  size="sm"
                  onClick={() => handleSort("name")}
                  className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  <span className={sortBy === "name" ? "text-white" : ""}>
                    {t("admin.addonManagement.nameAZ")}
                  </span>
                  {sortBy === "name" && (
                    <Icon path={mdiRefresh} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSort("createdAt")}
                  className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  <span className={sortBy === "createdAt" ? "text-white" : ""}>
                    {sortBy === "createdAt"
                      ? sortOrder === "desc"
                        ? t("admin.addonManagement.newestFirst")
                        : t("admin.addonManagement.oldestFirst")
                      : t("admin.addonManagement.newestFirst")}
                  </span>
                  {sortBy === "createdAt" && (
                    <Icon path={mdiRefresh} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.addonManagement.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.addonManagement.loadingDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.addonManagement.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.addonManagement.description")}
          </p>
        </div>

        {canCreateAddon && (
          <Button
            onClick={handleCreateNew}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            <Icon path={mdiPlus} size={0.67} className="mr-2" />
            {t("admin.addonManagement.addAddon")}
          </Button>
        )}
      </div>

      {isSuperAdmin && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={
                    addons.length > 0 && addons.every((a) => selectedAddonIds.has(a.id))
                  }
                  onCheckedChange={(checked) =>
                    setAllSelectedAddonsOnPage(Boolean(checked))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {t("admin.addonManagement.selectedCount", {
                    defaultValue: "Selected: {{count}}",
                    count: selectedAddonIds.size,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setSelectedAddonIds(new Set())}
                  disabled={selectedAddonIds.size === 0}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  {t("admin.addonManagement.clearSelection", {
                    defaultValue: "Clear",
                  })}
                </Button>
                <Button
                  type="button"
                  onClick={openBulkMoveAddons}
                  disabled={selectedAddonIds.size === 0}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {t("admin.addonManagement.moveSelected", {
                    defaultValue: "Move selected",
                  })}
                </Button>
                <Button
                  type="button"
                  onClick={openBulkCopyAddons}
                  disabled={selectedAddonIds.size === 0}
                  className="bg-transparent hover:bg-muted text-foreground border border-border"
                >
                  {t("admin.addonManagement.copySelected", {
                    defaultValue: "Copy selected",
                  })}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.addonManagement.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9 bg-transparent text-foreground border-border"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
              <Select
                value={selectedActiveStatus || "all"}
                onValueChange={(value: string) => {
                  setSelectedActiveStatus(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue placeholder={t("admin.addonManagement.allStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin.addonManagement.allStatus")}</SelectItem>
                  <SelectItem value="true">{t("admin.addonManagement.active")}</SelectItem>
                  <SelectItem value="false">{t("admin.addonManagement.inactive")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">{t("admin.addonManagement.sortBy")}:</span>
              <Button
                size="sm"
                onClick={() => handleSort("name")}
                className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
              >
                <span className={sortBy === "name" ? "text-white" : ""}>
                  {t("admin.addonManagement.nameAZ")}
                </span>
                {sortBy === "name" && (
                  <Icon path={mdiRefresh} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => handleSort("createdAt")}
                className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
              >
                <span className={sortBy === "createdAt" ? "text-white" : ""}>
                  {sortBy === "createdAt"
                    ? sortOrder === "desc"
                      ? t("admin.addonManagement.newestFirst")
                      : t("admin.addonManagement.oldestFirst")
                    : t("admin.addonManagement.newestFirst")}
                </span>
                {sortBy === "createdAt" && (
                  <Icon path={mdiRefresh} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {addons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Icon path={mdiRefresh} size={2.0} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.addonManagement.noAddonsFound", {
                defaultValue: "No addons found",
              })}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchTerm
                ? t("admin.addonManagement.tryAdjustingFilters", {
                    defaultValue: "Try adjusting your search or filters.",
                  })
                : t("admin.addonManagement.getStarted", {
                    defaultValue: "Get started by creating your first addon.",
                  })}
            </p>
            {!searchTerm && canCreateAddon && (
              <Button
                onClick={handleCreateNew}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                <Icon path={mdiPlus} size={0.67} className="mr-2" />
                {t("admin.addonManagement.addAddon")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {addons.map((addon) => (
            <Card key={addon.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 truncate">
                      {isSuperAdmin && (
                        <Checkbox
                          checked={selectedAddonIds.has(addon.id)}
                          onCheckedChange={(checked) =>
                            toggleSelectedAddon(addon.id, Boolean(checked))
                          }
                        />
                      )}
                      {addon.name}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className={cn(
                        "px-2 py-1 text-xs rounded-full",
                        addon.isActive
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      )}
                    >
                      {addon.isActive
                        ? t("admin.addonManagement.active")
                        : t("admin.addonManagement.inactive")}
                    </span>
                    {canManageAddonActions && (
                      <DropdownMenu
                        open={openAddonMenuId === addon.id}
                        onOpenChange={(open) => {
                          setOpenAddonMenuId(open ? addon.id : null);
                        }}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 touch-manipulation relative z-10 pointer-events-auto"
                            onPointerDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={() => {
                              setOpenAddonMenuId((prev) =>
                                prev === addon.id ? null : addon.id
                              );
                            }}
                          >
                            <Icon path={mdiDotsVertical} size={0.67} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdateAddon && (
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenAddonMenuId(null);
                                handleEdit(addon);
                              }}
                            >
                              <Icon path={mdiPencil} size={0.67} className="mr-2" />
                              {t("admin.addonManagement.edit")}
                            </DropdownMenuItem>
                          )}
                          {canToggleAddon && (
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenAddonMenuId(null);
                                handleToggleStatus(addon);
                              }}
                            >
                              {addon.isActive ? (
                                <>
                                  <Icon path={mdiEyeOff} size={0.67} className="mr-2" />
                                  {t("admin.addonManagement.deactivate")}
                                </>
                              ) : (
                                <>
                                  <Icon path={mdiEye} size={0.67} className="mr-2" />
                                  {t("admin.addonManagement.activate")}
                                </>
                              )}
                            </DropdownMenuItem>
                          )}
                          {isSuperAdmin && (
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenAddonMenuId(null);
                                openMoveAddon(addon);
                              }}
                            >
                              <Icon path={mdiRefresh} size={0.67} className="mr-2" />
                              {t("admin.addonManagement.moveOrganization", { defaultValue: "Move to organization" })}
                            </DropdownMenuItem>
                          )}
                          {canDeleteAddon && (
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenAddonMenuId(null);
                                handleDeleteClick(addon);
                              }}
                              className="text-red-600 dark:text-red-400"
                            >
                              <Icon path={mdiDelete} size={0.67} className="mr-2" />
                              {t("admin.addonManagement.delete")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {addon.image && (
                    <div className="w-full h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                      <img
                        src={(() => {
                          const imgUrl = isExternalImage(addon.image)
                            ? addon.image
                            : getOptimizedImageUrl(addon.image);
                          return imgUrl;
                        })()}
                        alt={addon.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  )}

                  {addon.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {addon.description}
                    </p>
                  )}
                  {addon.addonCategories && addon.addonCategories.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground font-medium">
                        {t("admin.addonManagement.categories")}: 
                      </span>
                      {addon.addonCategories.map((ac) => (
                        <span
                          key={ac.id}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300 border border-pink-200 dark:border-pink-800"
                        >
                          {ac.category.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {formatPrice(parsePrice(addon.price || "0"), currency)}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-1 rounded-full text-xs",
                        addon.type === "BOOLEAN"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                      )}
                    >
                      {addon.type === "BOOLEAN"
                        ? t("admin.addonManagement.yesNo")
                        : t("admin.addonManagement.quantity")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {addon._count.mealAddOns} {t("admin.addonManagement.meals")}
                    </span>
                    <span>{new Date(addon.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("admin.addonManagement.showingAddons", {
              count: addons.length,
              total: totalCount,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="border-border hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
            >
              <Icon path={mdiChevronLeft} size={0.67} />
            </Button>
            <span className="text-sm text-foreground font-medium px-3 py-1 bg-muted rounded-md">
              {t("admin.addonManagement.pageOf", {
                current: currentPage,
                total: totalPages,
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="border-border hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
            >
              <Icon path={mdiChevronRight} size={0.67} />
            </Button>
          </div>
        </div>
      )}

      {/* Create Addon Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open: boolean) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-card text-foreground border-border">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.addonManagement.createNewAddon")}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t("admin.addonManagement.createAddonDescription")}
            </p>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                {t("admin.addonManagement.addonName")}{" "}
                <span className="text-red-500">
                  {t("admin.addonManagement.required")}
                </span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("admin.addonManagement.addonNamePlaceholder")}
                required
                className="bg-card border-border focus:border-pink-500 focus:ring-pink-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                {t("admin.addonManagement.descriptionLabel")}
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("admin.addonManagement.descriptionPlaceholder")}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nameFa" className="text-sm font-medium">
                {t("admin.addonManagement.addonNameFa")}
              </Label>
              <Input
                id="nameFa"
                value={formData.nameFa || ""}
                onChange={(e) =>
                  setFormData({ ...formData, nameFa: e.target.value })
                }
                placeholder={t("admin.addonManagement.addonNameFaPlaceholder")}
                className="bg-card border-border focus:border-pink-500 focus:ring-pink-500"
                dir="rtl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descriptionFa" className="text-sm font-medium">
                {t("admin.addonManagement.descriptionLabelFa")}
              </Label>
              <Textarea
                id="descriptionFa"
                value={formData.descriptionFa || ""}
                onChange={(e) =>
                  setFormData({ ...formData, descriptionFa: e.target.value })
                }
                placeholder={t("admin.addonManagement.descriptionPlaceholderFa")}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
                dir="rtl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="basePrice" className="text-sm font-medium">
                {t("admin.addonManagement.basePrice")}{" "}
                <span className="text-red-500">
                  {t("admin.addonManagement.required")}
                </span>
              </Label>
              <PriceInput
                id="basePrice"
                value={priceInput}
                onChange={(value) => {
                  setPriceInput(value);
                  setFormData({
                    ...formData,
                    price: value === "" ? 0 : parseFloat(value) || 0,
                  });
                }}
                placeholder="2.5"
                required
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.addonManagement.basePriceHint")}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  {t("admin.addonManagement.sizes")}{" "}
                  <span className="text-red-500">
                    {t("admin.addonManagement.required")}
                  </span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSize}
                  disabled={formData.sizes?.length >= 4}
                  className="border-border hover:bg-muted"
                >
                  <Icon path={mdiPlus} size={0.67} className="mr-1" />
                  {t("admin.addonManagement.addSize")}
                </Button>
              </div>
              <div className="space-y-2">
                {formData.sizes?.map((size, index) => (
                  <div key={index} className="flex flex-col gap-2 p-2 border rounded-md">
                    <div className="flex gap-2">
                      <Select
                        value={size.sizeType}
                        onValueChange={(value: "S" | "M" | "L" | "XL") =>
                          updateSize(index, "sizeType", value)
                        }
                      >
                        <SelectTrigger className="w-20 bg-card border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["S", "M", "L", "XL"] as const).map((sizeOption) => {
                            const isUsed = formData.sizes?.some(
                              (s, i) => s.sizeType === sizeOption && i !== index
                            );
                            return (
                              <SelectItem
                                key={sizeOption}
                                value={sizeOption}
                                disabled={isUsed}
                              >
                                {sizeOption}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <div className="flex-1">
                        <PriceInput
                          value={sizePriceInputs[index] || ""}
                          onChange={(value) => handleSizePriceChange(index, value)}
                          placeholder={t("admin.addonManagement.additionalPricePlaceholder")}
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center px-2">
                        {t("admin.addonManagement.totalPrice")}: {formatPrice(formData.price + (size.price ?? 0), currency)}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeSize(index)}
                        className="border-border hover:bg-muted"
                      >
                        <Icon path={mdiClose} size={0.67} />
                      </Button>
                    </div>
                    <div className="w-full">
                      <PriceInput
                        value={sizeTaxInputs[index] || ""}
                        onChange={(value) => handleSizeTaxChange(index, value)}
                        placeholder={t("admin.addonManagement.taxRatePlaceholder")}
                        disabled={isSubmitting}
                        showDollarIcon={false}
                      />
                    </div>
                  </div>
                ))}
                {(!formData.sizes || formData.sizes.length === 0) && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t("admin.addonManagement.noSizesAdded")}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxPercentage" className="text-sm font-medium">
                {t("admin.addonManagement.taxPercentage")}
              </Label>
              <PriceInput
                id="taxPercentage"
                value={taxInput}
                onChange={(value) => handleTaxChange(value)}
                placeholder="8.5"
                disabled={isSubmitting}
                showDollarIcon={false}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.addonManagement.taxPercentageHint")}
              </p>
            </div>

            <div className="space-y-2">
              <ImageUpload
                value={formData.image}
                onChange={(value) => setFormData({ ...formData, image: value })}
                label={t("admin.addonManagement.addonImage")}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("admin.addonManagement.addonType")}{" "}
                <span className="text-red-500">
                  {t("admin.addonManagement.required")}
                </span>
              </Label>
              <RadioGroup
                value={formData.type}
                onValueChange={(value: string) =>
                  setFormData({
                    ...formData,
                    type: value as "BOOLEAN" | "QUANTITY",
                  })
                }
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="BOOLEAN" id="boolean" />
                  <Label htmlFor="boolean" className="cursor-pointer">
                    {t("admin.addonManagement.boolean")}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="QUANTITY" id="quantity" />
                  <Label htmlFor="quantity" className="cursor-pointer">
                    {t("admin.addonManagement.quantity")}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  {t("admin.addonManagement.categories")}
                </Label>
                {formData.categoryIds && formData.categoryIds.length > 0 && (
                  <span className="text-xs text-pink-500 font-medium">
                    {formData.categoryIds.length}{" "}
                    {formData.categoryIds.length === 1
                      ? t("admin.addonManagement.category")
                      : t("admin.addonManagement.categories")}{" "}
                    {t("admin.addonManagement.selected")}
                  </span>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto border rounded-md p-3 bg-card">
                {categoriesLoading ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {t("admin.addonManagement.loadingCategories")}
                  </div>
                ) : categories.filter((cat) => cat.isActive).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("admin.addonManagement.noCategoriesAvailable")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {categories
                      .filter((cat) => cat.isActive)
                      .map((category) => (
                        <div
                          key={category.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`category-${category.id}`}
                            checked={formData.categoryIds?.includes(category.id) || false}
                            onCheckedChange={(checked) => {
                              const currentIds = formData.categoryIds || [];
                              if (checked) {
                                setFormData({
                                  ...formData,
                                  categoryIds: [...currentIds, category.id],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  categoryIds: currentIds.filter(
                                    (id) => id !== category.id
                                  ),
                                });
                              }
                            }}
                            variant="pink"
                          />
                          <Label
                            htmlFor={`category-${category.id}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {category.name}
                          </Label>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.addonManagement.categoryHint")}
              </p>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="h-4 w-4 rounded border-border text-pink-500 focus:ring-pink-500 focus:ring-2"
              />
              <Label
                htmlFor="isActive"
                className="text-sm font-medium cursor-pointer"
              >
                {t("admin.addonManagement.makeActive")}
              </Label>
            </div>

            {/* Excluded Branches Section */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                {t("admin.addonManagement.excludedBranches")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.addonManagement.excludedBranchesDescription")}
              </p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 space-y-2">
                {branches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t("admin.addonManagement.noBranchesAvailable")}
                  </p>
                ) : (
                  branches.map((branch) => (
                    <div
                      key={branch.id}
                      className="flex items-center justify-between p-2 hover:bg-muted/50 rounded cursor-pointer"
                      onClick={() => toggleExcludedBranch(branch.id)}
                    >
                      <div className="flex items-center space-x-2 flex-1">
                        <div
                          className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                            formData.excludedBranches?.includes(branch.id)
                              ? "bg-pink-500 border-pink-500"
                              : "border-muted-foreground"
                          )}
                        >
                          {formData.excludedBranches?.includes(branch.id) && (
                            <div className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </div>
                        <span className="text-sm text-foreground">
                          {branch.name}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
                <div className="flex-1 text-sm text-foreground">
                  <p className="font-medium text-foreground">
                    {t("admin.addonManagement.excludedBranches")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.addonManagement.branchesExcluded", {
                      count: formData.excludedBranches?.length || 0,
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  resetForm();
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
                disabled={isSubmitting}
              >
                {t("common.cancel")}
              </Button>
              {canCreateAddon && (
                <Button
                  type="submit"
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? t("admin.addonManagement.creating")
                    : t("admin.addonManagement.createAddon")}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Addon Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open: boolean) => {
          setIsEditDialogOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-card text-foreground border-border">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.addonManagement.editAddon")}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t("admin.addonManagement.editAddonDescription")}
            </p>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-sm font-medium">
                {t("admin.addonManagement.addonName")}{" "}
                <span className="text-red-500">
                  {t("admin.addonManagement.required")}
                </span>
              </Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("admin.addonManagement.addonNamePlaceholder")}
                required
                className="bg-card border-border focus:border-pink-500 focus:ring-pink-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description" className="text-sm font-medium">
                {t("admin.addonManagement.descriptionLabel")}
              </Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("admin.addonManagement.descriptionPlaceholder")}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-nameFa" className="text-sm font-medium">
                {t("admin.addonManagement.addonNameFa")}
              </Label>
              <Input
                id="edit-nameFa"
                value={formData.nameFa || ""}
                onChange={(e) =>
                  setFormData({ ...formData, nameFa: e.target.value })
                }
                placeholder={t("admin.addonManagement.addonNameFaPlaceholder")}
                className="bg-card border-border focus:border-pink-500 focus:ring-pink-500"
                dir="rtl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-descriptionFa" className="text-sm font-medium">
                {t("admin.addonManagement.descriptionLabelFa")}
              </Label>
              <Textarea
                id="edit-descriptionFa"
                value={formData.descriptionFa || ""}
                onChange={(e) =>
                  setFormData({ ...formData, descriptionFa: e.target.value })
                }
                placeholder={t("admin.addonManagement.descriptionPlaceholderFa")}
                rows={3}
                className="bg-transparent text-foreground border-border resize-none"
                dir="rtl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-basePrice" className="text-sm font-medium">
                {t("admin.addonManagement.basePrice")}{" "}
                <span className="text-red-500">
                  {t("admin.addonManagement.required")}
                </span>
              </Label>
              <PriceInput
                id="edit-basePrice"
                value={priceInput}
                onChange={(value) => {
                  setPriceInput(value);
                  setFormData({
                    ...formData,
                    price: value === "" ? 0 : parseFloat(value) || 0,
                  });
                }}
                placeholder="2.5"
                required
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.addonManagement.basePriceHint")}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  {t("admin.addonManagement.sizes")}{" "}
                  <span className="text-red-500">
                    {t("admin.addonManagement.required")}
                  </span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSize}
                  disabled={formData.sizes?.length >= 4}
                  className="border-border hover:bg-muted"
                >
                  <Icon path={mdiPlus} size={0.67} className="mr-1" />
                  {t("admin.addonManagement.addSize")}
                </Button>
              </div>
              <div className="space-y-2">
                {formData.sizes?.map((size, index) => (
                  <div key={index} className="flex flex-col gap-2 p-2 border rounded-md">
                    <div className="flex gap-2">
                      <Select
                        value={size.sizeType}
                        onValueChange={(value: "S" | "M" | "L" | "XL") =>
                          updateSize(index, "sizeType", value)
                        }
                      >
                        <SelectTrigger className="w-20 bg-card border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["S", "M", "L", "XL"] as const).map((sizeOption) => {
                            const isUsed = formData.sizes?.some(
                              (s, i) => s.sizeType === sizeOption && i !== index
                            );
                            return (
                              <SelectItem
                                key={sizeOption}
                                value={sizeOption}
                                disabled={isUsed}
                              >
                                {sizeOption}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <div className="flex-1">
                        <PriceInput
                          value={sizePriceInputs[index] || ""}
                          onChange={(value) => handleSizePriceChange(index, value)}
                          placeholder={t("admin.addonManagement.additionalPricePlaceholder")}
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center px-2">
                        {t("admin.addonManagement.totalPrice")}: {formatPrice(formData.price + (size.price ?? 0), currency)}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeSize(index)}
                        className="border-border hover:bg-muted"
                      >
                        <Icon path={mdiClose} size={0.67} />
                      </Button>
                    </div>
                    <div className="w-full">
                      <PriceInput
                        value={sizeTaxInputs[index] || ""}
                        onChange={(value) => handleSizeTaxChange(index, value)}
                        placeholder={t("admin.addonManagement.taxRatePlaceholder")}
                        disabled={isSubmitting}
                        showDollarIcon={false}
                      />
                    </div>
                  </div>
                ))}
                {(!formData.sizes || formData.sizes.length === 0) && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t("admin.addonManagement.noSizesAdded")}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="edit-taxPercentage"
                className="text-sm font-medium"
              >
                {t("admin.addonManagement.taxPercentage")}
              </Label>
              <PriceInput
                id="edit-taxPercentage"
                value={taxInput}
                onChange={(value) => handleTaxChange(value)}
                placeholder="8.5"
                disabled={isSubmitting}
                showDollarIcon={false}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.addonManagement.taxPercentageHint")}
              </p>
            </div>

            <div className="space-y-2">
              <ImageUpload
                value={formData.image}
                onChange={(value) => setFormData({ ...formData, image: value })}
                label={t("admin.addonManagement.addonImage")}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("admin.addonManagement.addonType")}{" "}
                <span className="text-red-500">
                  {t("admin.addonManagement.required")}
                </span>
              </Label>
              <RadioGroup
                value={formData.type}
                onValueChange={(value: string) =>
                  setFormData({
                    ...formData,
                    type: value as "BOOLEAN" | "QUANTITY",
                  })
                }
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="BOOLEAN" id="edit-boolean" />
                  <Label htmlFor="edit-boolean" className="cursor-pointer">
                    {t("admin.addonManagement.boolean")}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="QUANTITY" id="edit-quantity" />
                  <Label htmlFor="edit-quantity" className="cursor-pointer">
                    {t("admin.addonManagement.quantity")}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  {t("admin.addonManagement.categories")}
                </Label>
                {formData.categoryIds && formData.categoryIds.length > 0 && (
                  <span className="text-xs text-pink-500 font-medium">
                    {formData.categoryIds.length}{" "}
                    {formData.categoryIds.length === 1
                      ? t("admin.addonManagement.category")
                      : t("admin.addonManagement.categories")}{" "}
                    {t("admin.addonManagement.selected")}
                  </span>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto border rounded-md p-3 bg-card">
                {categoriesLoading ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {t("admin.addonManagement.loadingCategories")}
                  </div>
                ) : categories.filter((cat) => cat.isActive).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("admin.addonManagement.noCategoriesAvailable")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {categories
                      .filter((cat) => cat.isActive)
                      .map((category) => (
                        <div
                          key={category.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`edit-category-${category.id}`}
                            checked={formData.categoryIds?.includes(category.id) || false}
                            onCheckedChange={(checked) => {
                              const currentIds = formData.categoryIds || [];
                              if (checked) {
                                setFormData({
                                  ...formData,
                                  categoryIds: [...currentIds, category.id],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  categoryIds: currentIds.filter(
                                    (id) => id !== category.id
                                  ),
                                });
                              }
                            }}
                            variant="pink"
                          />
                          <Label
                            htmlFor={`edit-category-${category.id}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {category.name}
                          </Label>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.addonManagement.categoryHint")}
              </p>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
              <input
                type="checkbox"
                id="edit-isActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="h-4 w-4 rounded border-border text-pink-500 focus:ring-pink-500 focus:ring-2"
              />
              <Label
                htmlFor="edit-isActive"
                className="text-sm font-medium cursor-pointer"
              >
                {t("admin.addonManagement.makeActive")}
              </Label>
            </div>

            {/* Excluded Branches Section */}
            <div className="space-y-2">
              <Label className="text-foreground font-medium">
                {t("admin.addonManagement.excludedBranches")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.addonManagement.excludedBranchesDescription")}
              </p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 space-y-2">
                {branches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t("admin.addonManagement.noBranchesAvailable")}
                  </p>
                ) : (
                  branches.map((branch) => (
                    <div
                      key={branch.id}
                      className="flex items-center justify-between p-2 hover:bg-muted/50 rounded cursor-pointer"
                      onClick={() => toggleExcludedBranch(branch.id)}
                    >
                      <div className="flex items-center space-x-2 flex-1">
                        <div
                          className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                            formData.excludedBranches?.includes(branch.id)
                              ? "bg-pink-500 border-pink-500"
                              : "border-muted-foreground"
                          )}
                        >
                          {formData.excludedBranches?.includes(branch.id) && (
                            <div className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </div>
                        <span className="text-sm text-foreground">
                          {branch.name}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border border-border">
                <div className="flex-1 text-sm text-foreground">
                  <p className="font-medium text-foreground">
                    {t("admin.addonManagement.excludedBranches")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.addonManagement.branchesExcluded", {
                      count: formData.excludedBranches?.length || 0,
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Branch-Specific Prices Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-foreground font-medium">
                    Branch-Specific Prices
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Set different prices for this addon at specific branches
                  </p>
                </div>
                {canUpdateAddon && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setEditingBranchPrice({
                        branchId: "",
                        basePrice: formData.price?.toString() || "0",
                        taxPercentage: formData.taxPercentage?.toString() || "",
                      });
                    }}
                    className="bg-pink-500 hover:bg-pink-600 text-white"
                  >
                    <Icon path={mdiPlus} size={0.67} className="mr-1" />
                    {t("admin.addonManagement.addBranchPrice")}
                  </Button>
                )}
              </div>

              {loadingBranchPrices ? (
                <div className="text-center py-4">
                  <Icon path={mdiRefresh} size={0.67} className="animate-spin mx-auto" />
                </div>
              ) : branchPrices.length === 0 ? (
                <div className="p-4 border border-border rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground text-center">
                    No branch-specific prices set. The addon will use the base price at all branches.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {branchPrices.map((bp) => (
                    <div
                      key={bp.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg bg-card"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {bp.branch.name}
                        </p>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs text-muted-foreground">
                            Price: {formatPrice(parseFloat(bp.basePrice), currency)}
                          </span>
                          {bp.taxPercentage !== null && (
                            <span className="text-xs text-muted-foreground">
                              Tax: {bp.taxPercentage}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canUpdateAddon && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingBranchPrice({
                                branchId: bp.branchId,
                                basePrice: bp.basePrice,
                                taxPercentage: bp.taxPercentage?.toString() || "",
                              });
                            }}
                            className="border-border"
                          >
                            <Icon path={mdiPencil} size={0.50} />
                          </Button>
                        )}
                        {canDeleteAddon && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-border text-red-500 hover:text-red-600"
                            onClick={() => handleDeleteBranchPriceClick(bp.branchId, bp.branch.name)}
                          >
                            <Icon path={mdiDelete} size={0.50} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add/Edit Branch Price Dialog */}
              {editingBranchPrice && (
                <div className="mt-4 p-4 border border-border rounded-lg bg-muted/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-foreground font-medium">
                      {branchPrices.find(bp => bp.branchId === editingBranchPrice.branchId)
                        ? t("admin.addonManagement.editBranchPrice")
                        : t("admin.addonManagement.addBranchPrice")}
                    </Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingBranchPrice(null)}
                    >
                      <Icon path={mdiClose} size={0.67} />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground text-sm">{t("admin.addonManagement.branch")}</Label>
                    <Select
                      value={editingBranchPrice.branchId}
                      onValueChange={(value) =>
                        setEditingBranchPrice({
                          ...editingBranchPrice,
                          branchId: value,
                        })
                      }
                    >
                      <SelectTrigger className="bg-card border-border">
                        <SelectValue placeholder={t("admin.addonManagement.selectBranch")} />
                      </SelectTrigger>
                      <SelectContent>
                        {branches
                          .filter(
                            (b) =>
                              !branchPrices.find(
                                (bp) =>
                                  bp.branchId === b.id &&
                                  bp.branchId !== editingBranchPrice.branchId
                              )
                          )
                          .map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground text-sm">{t("admin.addonManagement.basePrice")}</Label>
                    <PriceInput
                      value={editingBranchPrice.basePrice}
                      onChange={(value) =>
                        setEditingBranchPrice({
                          ...editingBranchPrice,
                          basePrice: value,
                        })
                      }
                      placeholder="0.00"
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground text-sm">{t("admin.addonManagement.taxPercentage")} ({t("admin.addonManagement.optional")})</Label>
                    <PriceInput
                      value={editingBranchPrice.taxPercentage}
                      onChange={(value) =>
                        setEditingBranchPrice({
                          ...editingBranchPrice,
                          taxPercentage: value,
                        })
                      }
                      placeholder="8.5"
                      disabled={isSubmitting}
                      showDollarIcon={false}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingBranchPrice(null)}
                      className="border-border"
                    >
                      {t("common.cancel")}
                    </Button>
                    {canUpdateAddon && (
                      <Button
                        type="button"
                        onClick={handleSaveBranchPrice}
                        className="bg-pink-500 hover:bg-pink-600 text-white"
                        disabled={!editingBranchPrice.branchId || !editingBranchPrice.basePrice}
                      >
                        {t("admin.addonManagement.save")}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  resetForm();
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
                disabled={isSubmitting}
              >
                {t("common.cancel")}
              </Button>
              {canUpdateAddon && (
                <Button
                  type="submit"
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? t("admin.addonManagement.updating")
                    : t("admin.addonManagement.updateAddon")}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Addon Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.addonManagement.deleteAddon")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              {t(
                "admin.addonManagement.deleteAddonDescription",
                { name: addonToDelete?.name || "" }
              )}
              {addonToDelete && addonToDelete._count.mealAddOns > 0 && (
                <span className="block mt-2 text-red-600 dark:text-red-400">
                  {t(
                    "admin.addonManagement.deleteAddonWarning",
                    { count: addonToDelete._count.mealAddOns }
                  )}
                </span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setAddonToDelete(null);
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t("admin.addonManagement.deleteAddonCancel")}
              </Button>
              {canDeleteAddon && (
                <Button
                  onClick={handleDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {t("admin.addonManagement.deleteAddonConfirm")}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Branch Price Dialog */}
      <Dialog open={isDeleteBranchPriceDialogOpen} onOpenChange={setIsDeleteBranchPriceDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.addonManagement.deleteBranchPrice")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              {t("admin.addonManagement.deleteBranchPriceDescription", {
                branchName: branchPriceToDelete?.branchName || "",
              })}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setIsDeleteBranchPriceDialogOpen(false);
                  setBranchPriceToDelete(null);
                }}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t("common.cancel")}
              </Button>
              {canDeleteAddon && (
                <Button
                  onClick={handleDeleteBranchPrice}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {t("admin.addonManagement.delete")}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to Organization Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.addonManagement.moveOrganization", { defaultValue: "Move to organization" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{addonToMove?.name}</p>
            <div className="space-y-2">
              <Label>
                {t("admin.addonManagement.targetOrganization", { defaultValue: "Target organization" })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={targetOrganizationId}
                onValueChange={setTargetOrganizationId}
                placeholder={t("admin.addonManagement.selectOrganization", {
                  defaultValue: "Select organization",
                })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setMoveDialogOpen(false);
                  setAddonToMove(null);
                }}
                disabled={moving}
                className="bg-transparent hover:bg-muted text-foreground border border-border h-10"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleMoveAddon}
                disabled={moving}
                className="bg-pink-500 hover:bg-pink-600 text-white h-10"
              >
                {moving ? t("common.loading") : t("common.save", { defaultValue: "Save" })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkMoveDialogOpen} onOpenChange={setBulkMoveDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.addonManagement.moveSelected", {
                defaultValue: "Move selected",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("admin.addonManagement.selectedCount", {
                defaultValue: "Selected: {{count}}",
                count: selectedAddonIds.size,
              })}
            </p>
            <div className="space-y-2">
              <Label>
                {t("admin.addonManagement.targetOrganization", {
                  defaultValue: "Target organization",
                })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={bulkTargetOrganizationId}
                onValueChange={setBulkTargetOrganizationId}
                placeholder={t("admin.addonManagement.selectOrganization", {
                  defaultValue: "Select organization",
                })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setBulkMoveDialogOpen(false)}
                disabled={bulkMoving}
                className="bg-transparent hover:bg-muted text-foreground border border-border h-10"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleBulkMoveAddons}
                disabled={bulkMoving}
                className="bg-pink-500 hover:bg-pink-600 text-white h-10"
              >
                {bulkMoving
                  ? t("common.loading")
                  : t("common.save", { defaultValue: "Save" })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkCopyDialogOpen} onOpenChange={setBulkCopyDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.addonManagement.copySelected", {
                defaultValue: "Copy selected",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("admin.addonManagement.selectedCount", {
                defaultValue: "Selected: {{count}}",
                count: selectedAddonIds.size,
              })}
            </p>
            <div className="space-y-2">
              <Label>
                {t("admin.addonManagement.targetOrganization", {
                  defaultValue: "Target organization",
                })}
              </Label>
              <OrganizationSearchSelect
                organizations={organizations || []}
                value={bulkCopyTargetOrganizationId}
                onValueChange={setBulkCopyTargetOrganizationId}
                placeholder={t("admin.addonManagement.selectOrganization", {
                  defaultValue: "Select organization",
                })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setBulkCopyDialogOpen(false)}
                disabled={bulkCopying}
                className="bg-transparent hover:bg-muted text-foreground border border-border h-10"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleBulkCopyAddons}
                disabled={bulkCopying}
                className="bg-pink-500 hover:bg-pink-600 text-white h-10"
              >
                {bulkCopying ? t("common.loading") : t("common.save", { defaultValue: "Save" })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AddonManagement;
