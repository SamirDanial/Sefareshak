import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import Icon from "@mdi/react";
import { mdiRefresh, mdiContentSave, mdiScale, mdiPackageVariant, mdiDelete } from "@mdi/js";
import branchService, { type Branch } from "@/services/branchService";
import { usePermissions } from "@/contexts/PermissionContext";
import {
  deliverableQuantityService,
  type MealWithSizes,
  type MealSizeWithWeight,
  type AvailableWeight,
  type DailyDeliverable,
  type Category,
} from "@/services/deliverableQuantityService";

export default function DeliverableQuantities() {
  const { getToken } = useAuth();
  const { assignedBranchIds, canAny } = usePermissions();

  const canViewDeliverableQuantities = canAny([
    { resource: "deliverable_quantities", action: "view" },
    { resource: "deliverable_quantities", action: "manage" },
  ]);

  const canManageDeliverableQuantities = canAny([
    { resource: "deliverable_quantities", action: "manage" },
  ]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [savingSizeWeights, setSavingSizeWeights] = useState(false);
  const [savingDailyLimit, setSavingDailyLimit] = useState(false);
  const [deletingDailyLimit, setDeletingDailyLimit] = useState(false);

  // Data states
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allMeals, setAllMeals] = useState<MealWithSizes[]>([]); // All meals for branch
  const [mealSizes, setMealSizes] = useState<MealSizeWithWeight[]>([]);
  const [dailyDeliverable, setDailyDeliverable] = useState<DailyDeliverable | null>(null);
  const [availableWeight, setAvailableWeight] = useState<AvailableWeight | null>(null);

  // Selection states
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedMealId, setSelectedMealId] = useState<string>("");

  // Form states - local edits before saving
  const [sizeWeights, setSizeWeights] = useState<Record<string, string>>({});
  const [dailyLimitInput, setDailyLimitInput] = useState<string>("");

  // Track if there are unsaved changes
  const [hasSizeWeightChanges, setHasSizeWeightChanges] = useState(false);

  // Derive categories from allMeals
  const categories = useMemo((): Category[] => {
    const categoryMap = new Map<string, Category>();
    allMeals.forEach((meal) => {
      if (meal.category && !categoryMap.has(meal.category.id)) {
        categoryMap.set(meal.category.id, meal.category);
      }
    });
    return Array.from(categoryMap.values()).sort((a, b) => 
      a.name.localeCompare(b.name)
    );
  }, [allMeals]);

  // Filter meals by selected category
  const filteredMeals = useMemo((): MealWithSizes[] => {
    if (!selectedCategoryId) return [];
    return allMeals.filter((meal) => meal.categoryId === selectedCategoryId);
  }, [allMeals, selectedCategoryId]);

  // Load branches on mount
  useEffect(() => {
    const loadBranches = async () => {
      try {
        setLoading(true);
        const token = await getToken();
        const fetchedBranches = await branchService.getBranches(token || undefined);
        setBranches(fetchedBranches || []);

        // Default to assigned branch (EMPLOYEE/WAITER) when exactly one; otherwise fall back to single-branch org
        if (!selectedBranchId && assignedBranchIds.length === 1) {
          const candidate = assignedBranchIds[0];
          const exists = (fetchedBranches || []).some((b) => b.id === candidate);
          if (candidate && exists) {
            setSelectedBranchId(candidate);
          }
        } else if (!selectedBranchId && fetchedBranches && fetchedBranches.length === 1 && fetchedBranches[0]?.id) {
          setSelectedBranchId(fetchedBranches[0].id);
        }
      } catch (error) {
        console.error("Error loading branches:", error);
        toast.error("Failed to load branches");
      } finally {
        setLoading(false);
      }
    };
    loadBranches();
  }, [getToken, selectedBranchId, assignedBranchIds]);

  // Load meals when branch changes
  useEffect(() => {
    if (!selectedBranchId) {
      setAllMeals([]);
      setSelectedCategoryId("");
      setSelectedMealId("");
      return;
    }

    const loadMeals = async () => {
      try {
        setLoadingMeals(true);
        const token = await getToken();
        const fetchedMeals = await deliverableQuantityService.getMealsForBranch(
          selectedBranchId,
          token || undefined
        );
        setAllMeals(fetchedMeals || []);
        
        // Reset category and meal selection
        setSelectedCategoryId("");
        setSelectedMealId("");
        setMealSizes([]);
        setSizeWeights({});
        setHasSizeWeightChanges(false);
      } catch (error) {
        console.error("Error loading meals:", error);
        toast.error("Failed to load meals for this branch");
        setAllMeals([]);
      } finally {
        setLoadingMeals(false);
      }
    };
    loadMeals();
  }, [selectedBranchId, getToken]);

  // Load meal sizes when meal changes
  useEffect(() => {
    if (!selectedBranchId || !selectedMealId) {
      setMealSizes([]);
      setSizeWeights({});
      setHasSizeWeightChanges(false);
      return;
    }

    const loadSizes = async () => {
      try {
        setLoadingSizes(true);
        const token = await getToken();
        const result = await deliverableQuantityService.getMealSizes(
          selectedBranchId,
          selectedMealId,
          token || undefined
        );
        
        setMealSizes(result.sizes || []);
        
        // Initialize local state with current weights
        const initialWeights: Record<string, string> = {};
        (result.sizes || []).forEach((size) => {
          initialWeights[size.id] = size.weight !== null ? String(size.weight) : "";
        });
        setSizeWeights(initialWeights);
        setHasSizeWeightChanges(false);
      } catch (error) {
        console.error("Error loading meal sizes:", error);
        toast.error("Failed to load meal sizes");
        setMealSizes([]);
      } finally {
        setLoadingSizes(false);
      }
    };
    loadSizes();
  }, [selectedBranchId, selectedMealId, getToken]);

  // Load daily deliverable and available weight when filters change
  const loadDailyData = useCallback(async () => {
    if (!selectedBranchId || !selectedMealId) {
      setDailyDeliverable(null);
      setAvailableWeight(null);
      setDailyLimitInput("");
      return;
    }

    try {
      setLoadingDaily(true);
      const token = await getToken();

      const [dailyResult, availableResult] = await Promise.all([
        deliverableQuantityService.getDailyDeliverable(
          selectedBranchId,
          selectedMealId,
          token || undefined
        ),
        deliverableQuantityService.getAvailableWeight(
          selectedBranchId,
          selectedMealId,
          token || undefined
        ),
      ]);

      setDailyDeliverable(dailyResult);
      setAvailableWeight(availableResult);
      setDailyLimitInput(
        dailyResult?.dailyDeliverableWeight !== undefined
          ? String(dailyResult.dailyDeliverableWeight)
          : ""
      );
    } catch (error) {
      console.error("Error loading daily data:", error);
      toast.error("Failed to load daily deliverable data");
      setDailyDeliverable(null);
      setAvailableWeight(null);
      setDailyLimitInput("");
    } finally {
      setLoadingDaily(false);
    }
  }, [selectedBranchId, selectedMealId, getToken]);

  useEffect(() => {
    loadDailyData();
  }, [loadDailyData]);

  // Handlers
  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId);
    setSelectedCategoryId("");
    setSelectedMealId("");
    setMealSizes([]);
    setSizeWeights({});
    setDailyDeliverable(null);
    setAvailableWeight(null);
    setDailyLimitInput("");
    setHasSizeWeightChanges(false);
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setSelectedMealId("");
    setMealSizes([]);
    setSizeWeights({});
    setDailyDeliverable(null);
    setAvailableWeight(null);
    setDailyLimitInput("");
    setHasSizeWeightChanges(false);
  };

  const handleMealChange = (mealId: string) => {
    setSelectedMealId(mealId);
  };

  const handleSizeWeightChange = (mealSizeId: string, value: string) => {
    // Allow empty or valid decimal numbers
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setSizeWeights((prev) => ({
        ...prev,
        [mealSizeId]: value,
      }));
      setHasSizeWeightChanges(true);
    }
  };

  const handleDailyLimitInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty or valid decimal numbers
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setDailyLimitInput(value);
    }
  };

  const handleSaveSizeWeights = async () => {
    if (!canManageDeliverableQuantities) {
      toast.error("Access denied");
      return;
    }
    if (!selectedBranchId || !selectedMealId) {
      toast.error("Please select a branch and meal first");
      return;
    }

    // Validate all weights are positive numbers
    const invalidWeights = Object.entries(sizeWeights).filter(([, value]) => {
      if (value === "") return false; // Empty is allowed (no weight configured)
      const num = parseFloat(value);
      return isNaN(num) || num < 0;
    });

    if (invalidWeights.length > 0) {
      toast.error("All weights must be positive numbers");
      return;
    }

    try {
      setSavingSizeWeights(true);
      const token = await getToken();

      // Save each size weight
      const promises = Object.entries(sizeWeights)
        .filter(([, value]) => value !== "") // Only save non-empty weights
        .map(([mealSizeId, weight]) =>
          deliverableQuantityService.upsertSizeWeight(
            {
              branchId: selectedBranchId,
              mealId: selectedMealId,
              mealSizeId,
              weight: parseFloat(weight),
            },
            token || undefined
          )
        );

      await Promise.all(promises);
      toast.success("Size weights saved successfully");
      setHasSizeWeightChanges(false);

      // Reload daily data to refresh available weight calculations
      await loadDailyData();
    } catch (error) {
      console.error("Error saving size weights:", error);
      toast.error("Failed to save size weights");
    } finally {
      setSavingSizeWeights(false);
    }
  };

  const handleSaveDailyLimit = async () => {
    if (!canManageDeliverableQuantities) {
      toast.error("Access denied");
      return;
    }
    if (!selectedBranchId || !selectedMealId) {
      toast.error("Please select a branch and meal first");
      return;
    }

    if (dailyLimitInput === "") {
      toast.error("Please enter a daily deliverable weight");
      return;
    }

    const weight = parseFloat(dailyLimitInput);
    if (isNaN(weight) || weight < 0) {
      toast.error("Daily deliverable weight must be a positive number");
      return;
    }

    try {
      setSavingDailyLimit(true);
      const token = await getToken();

      await deliverableQuantityService.upsertDailyDeliverable(
        {
          branchId: selectedBranchId,
          mealId: selectedMealId,
          dailyDeliverableWeight: weight,
        },
        token || undefined
      );

      toast.success("Daily limit saved successfully");

      // Reload daily data
      await loadDailyData();
    } catch (error) {
      console.error("Error saving daily limit:", error);
      toast.error("Failed to save daily limit");
    } finally {
      setSavingDailyLimit(false);
    }
  };

  const handleDeleteDailyLimit = async () => {
    if (!canManageDeliverableQuantities) {
      toast.error("Access denied");
      return;
    }
    if (!selectedBranchId || !selectedMealId) {
      toast.error("Please select a branch and meal first");
      return;
    }

    if (!dailyDeliverable) {
      toast.error("No daily limit to delete");
      return;
    }

    try {
      setDeletingDailyLimit(true);
      const token = await getToken();

      await deliverableQuantityService.deleteDailyDeliverable(
        selectedBranchId,
        selectedMealId,
        token || undefined
      );

      toast.success("Daily limit removed - meal now has unlimited deliverables");

      // Reload daily data
      await loadDailyData();
    } catch (error) {
      console.error("Error deleting daily limit:", error);
      toast.error("Failed to delete daily limit");
    } finally {
      setDeletingDailyLimit(false);
    }
  };

  // Format number for display
  const formatWeight = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "—";
    return value.toFixed(2);
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6 pb-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Loading Deliverable Quantities
            </h3>
            <p className="text-sm text-muted-foreground">
              Please wait while we load your configuration...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!canViewDeliverableQuantities) {
    return (
      <div className="space-y-6 pb-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Access denied</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isFilterComplete = selectedBranchId && selectedCategoryId && selectedMealId;
  const selectedMeal = filteredMeals.find((m) => m.id === selectedMealId);
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="space-y-6 pb-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-pink-500 flex items-center gap-2">
            <Icon path={mdiScale} size={0.83} />
            Deliverable Quantities
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage per-branch meal size weights and daily deliverable limits. Limits apply every day automatically.
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleSaveSizeWeights}
          disabled={!canManageDeliverableQuantities || !hasSizeWeightChanges || savingSizeWeights || !isFilterComplete}
          className="bg-pink-500 hover:bg-pink-600 text-white"
        >
          {savingSizeWeights ? (
            <>
              <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Icon path={mdiContentSave} size={0.67} className="mr-2" />
              Save weights
            </>
          )}
        </Button>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Filters Card */}
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon path={mdiPackageVariant} size={0.83} />
              Filters
            </CardTitle>
            <CardDescription>
              Select branch, category, and meal to configure limits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Branch Select */}
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select
                value={selectedBranchId}
                onValueChange={handleBranchChange}
              >
                <SelectTrigger className="bg-transparent">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name || branch.code || "Unnamed Branch"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Select */}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={selectedCategoryId}
                onValueChange={handleCategoryChange}
                disabled={!selectedBranchId || loadingMeals}
              >
                <SelectTrigger className="bg-transparent">
                  <SelectValue
                    placeholder={
                      loadingMeals
                        ? "Loading categories..."
                        : !selectedBranchId
                        ? "Select a branch first"
                        : "Select category"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBranchId && categories.length === 0 && !loadingMeals && (
                <p className="text-xs text-muted-foreground">
                  No categories available for this branch
                </p>
              )}
            </div>

            {/* Meal Select */}
            <div className="space-y-2">
              <Label>Meal</Label>
              <Select
                value={selectedMealId}
                onValueChange={handleMealChange}
                disabled={!selectedCategoryId}
              >
                <SelectTrigger className="bg-transparent">
                  <SelectValue
                    placeholder={
                      !selectedBranchId
                        ? "Select a branch first"
                        : !selectedCategoryId
                        ? "Select a category first"
                        : "Select meal"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredMeals.map((meal) => (
                    <SelectItem key={meal.id} value={meal.id}>
                      {meal.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategoryId && filteredMeals.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No meals available in this category
                </p>
              )}
            </div>

            {/* Current Selection Summary */}
            {isFilterComplete && selectedMeal && selectedCategory && (
              <div className="pt-2 border-t border-border space-y-1">
                <p className="text-xs text-muted-foreground">
                  Category: <span className="font-medium text-foreground">{selectedCategory.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Meal: <span className="font-medium text-foreground">{selectedMeal.name}</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Size Weights Card */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Size weights (kg)</CardTitle>
            <CardDescription>
              Define how each size counts toward the daily deliverable total.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingSizes ? (
              <div className="flex items-center justify-center py-8">
                <Icon path={mdiRefresh} size={1.00} className="animate-spin text-pink-500" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Loading sizes...
                </span>
              </div>
            ) : !isFilterComplete ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Select a branch, category, and meal to view and configure size weights.
              </div>
            ) : mealSizes.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No sizes configured for this meal.
              </div>
            ) : (
              <div className="rounded-md border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3">Size</TableHead>
                      <TableHead className="w-1/3">Type</TableHead>
                      <TableHead className="w-1/3 text-right">
                        Weight (kg)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mealSizes.map((size) => (
                      <TableRow key={size.id}>
                        <TableCell className="font-medium">{size.name}</TableCell>
                        <TableCell>{size.sizeType}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            className="w-28 text-right ml-auto"
                            placeholder="0.00"
                            value={sizeWeights[size.id] || ""}
                            onChange={(e) =>
                              handleSizeWeightChange(size.id, e.target.value)
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasSizeWeightChanges && isFilterComplete && mealSizes.length > 0 && (
              <p className="text-xs text-amber-500">
                You have unsaved changes to size weights.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Deliverable Card */}
      <Card>
        <CardHeader>
          <CardTitle>Daily deliverable limit</CardTitle>
          <CardDescription>
            Set the maximum deliverable weight per day. This limit applies automatically every day.
            Leave empty or remove to allow unlimited deliveries for this meal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingDaily ? (
            <div className="flex items-center justify-center py-8">
              <Icon path={mdiRefresh} size={1.00} className="animate-spin text-pink-500" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading daily data...
              </span>
            </div>
          ) : !isFilterComplete ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Select a branch, category, and meal to view and configure daily limits.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Daily deliverable weight (kg)</Label>
                <Input
                  placeholder="e.g. 50 (leave empty for unlimited)"
                  value={dailyLimitInput}
                  onChange={handleDailyLimitInputChange}
                  className="bg-transparent"
                />
                {!dailyDeliverable && (
                  <p className="text-xs text-muted-foreground">
                    No limit set - unlimited deliveries allowed
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Consumed today (kg)</Label>
                <Input
                  value={formatWeight(availableWeight?.consumedWeight)}
                  disabled
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Available today (kg)</Label>
                <Input
                  value={
                    availableWeight?.availableWeight !== null
                      ? formatWeight(availableWeight?.availableWeight)
                      : "∞ Unlimited"
                  }
                  disabled
                  className="bg-muted/50"
                />
              </div>
              <div className="md:col-span-3 flex justify-end gap-2">
                {dailyDeliverable && (
                  <Button
                    variant="outline"
                    onClick={handleDeleteDailyLimit}
                    disabled={!canManageDeliverableQuantities || deletingDailyLimit}
                    className="border-destructive text-destructive hover:bg-destructive/10"
                  >
                    {deletingDailyLimit ? (
                      <>
                        <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                        Removing...
                      </>
                    ) : (
                      <>
                        <Icon path={mdiDelete} size={0.67} className="mr-2" />
                        Remove limit
                      </>
                    )}
                  </Button>
                )}
                <Button
                  onClick={handleSaveDailyLimit}
                  disabled={!canManageDeliverableQuantities || savingDailyLimit || !dailyLimitInput}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {savingDailyLimit ? (
                    <>
                      <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Icon path={mdiContentSave} size={0.67} className="mr-2" />
                      Save daily limit
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
