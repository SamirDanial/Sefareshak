import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import Icon from "@mdi/react";
import { mdiContentSave, mdiDelete, mdiPackageVariant, mdiRefresh } from "@mdi/js";

import { toast } from "@/components/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "@/lib/permissions";
import branchService, { type Branch } from "@/services/branchService";
import {
  deliverableQuantityService,
  type AvailableWeight,
  type Category,
  type DailyDeliverable,
  type MealSizeWithWeight,
  type MealWithSizes,
} from "@/services/deliverableQuantityService";

const DeliverableQuantities: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { assignedBranchIds, canAny } = usePermissions();

  const canViewDeliverableQuantities = canAny([
    { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.VIEW },
    { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.MANAGE },
  ]);

  const canManageDeliverableQuantities = canAny([
    { resource: RESOURCES.DELIVERABLE_QUANTITIES, action: ACTIONS.MANAGE },
  ]);

  const [loading, setLoading] = useState(true);
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [savingSizeWeights, setSavingSizeWeights] = useState(false);
  const [savingDailyLimit, setSavingDailyLimit] = useState(false);
  const [deletingDailyLimit, setDeletingDailyLimit] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [allMeals, setAllMeals] = useState<MealWithSizes[]>([]);
  const [mealSizes, setMealSizes] = useState<MealSizeWithWeight[]>([]);
  const [dailyDeliverable, setDailyDeliverable] = useState<DailyDeliverable | null>(null);
  const [availableWeight, setAvailableWeight] = useState<AvailableWeight | null>(null);

  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedMealId, setSelectedMealId] = useState<string>("");

  const [sizeWeights, setSizeWeights] = useState<Record<string, string>>({});
  const [dailyLimitInput, setDailyLimitInput] = useState<string>("");
  const [hasSizeWeightChanges, setHasSizeWeightChanges] = useState(false);

  const categories = useMemo((): Category[] => {
    const categoryMap = new Map<string, Category>();
    allMeals.forEach((meal) => {
      if (meal.category && !categoryMap.has(meal.category.id)) {
        categoryMap.set(meal.category.id, meal.category);
      }
    });
    return Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allMeals]);

  const filteredMeals = useMemo((): MealWithSizes[] => {
    if (!selectedCategoryId) return [];
    return allMeals.filter((meal) => meal.categoryId === selectedCategoryId);
  }, [allMeals, selectedCategoryId]);

  useEffect(() => {
    const loadBranches = async () => {
      try {
        setLoading(true);
        const token = await getToken();
        const fetchedBranches = await branchService.getBranches(token || undefined);
        setBranches(fetchedBranches || []);

        if (!selectedBranchId && assignedBranchIds.length === 1) {
          const candidate = assignedBranchIds[0];
          const exists = (fetchedBranches || []).some((b) => b.id === candidate);
          if (candidate && exists) {
            setSelectedBranchId(candidate);
          }
        } else if (!selectedBranchId && fetchedBranches && fetchedBranches.length === 1 && fetchedBranches[0]?.id) {
          setSelectedBranchId(fetchedBranches[0].id);
        }
      } catch (error: any) {
        console.error("Error loading branches:", error);
        toast.error(
          t("admin.deliverableQuantities.errors.loadBranches", {
            defaultValue: "Failed to load branches",
          })
        );
      } finally {
        setLoading(false);
      }
    };

    void loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, selectedBranchId, assignedBranchIds.length]);

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

        setSelectedCategoryId("");
        setSelectedMealId("");
        setMealSizes([]);
        setSizeWeights({});
        setHasSizeWeightChanges(false);
      } catch (error: any) {
        console.error("Error loading meals:", error);
        toast.error(
          t("admin.deliverableQuantities.errors.loadMeals", {
            defaultValue: "Failed to load meals for this branch",
          })
        );
        setAllMeals([]);
      } finally {
        setLoadingMeals(false);
      }
    };

    void loadMeals();
  }, [selectedBranchId, getToken]);

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

        const initialWeights: Record<string, string> = {};
        (result.sizes || []).forEach((size) => {
          initialWeights[size.id] = size.weight !== null ? String(size.weight) : "";
        });
        setSizeWeights(initialWeights);
        setHasSizeWeightChanges(false);
      } catch (error: any) {
        console.error("Error loading meal sizes:", error);
        toast.error(
          t("admin.deliverableQuantities.errors.loadSizes", {
            defaultValue: "Failed to load meal sizes",
          })
        );
        setMealSizes([]);
      } finally {
        setLoadingSizes(false);
      }
    };

    void loadSizes();
  }, [selectedBranchId, selectedMealId, getToken]);

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
        deliverableQuantityService.getDailyDeliverable(selectedBranchId, selectedMealId, token || undefined),
        deliverableQuantityService.getAvailableWeight(selectedBranchId, selectedMealId, token || undefined),
      ]);

      setDailyDeliverable(dailyResult);
      setAvailableWeight(availableResult);
      setDailyLimitInput(
        dailyResult?.dailyDeliverableWeight !== undefined ? String(dailyResult.dailyDeliverableWeight) : ""
      );
    } catch (error: any) {
      console.error("Error loading daily data:", error);
      toast.error(
        t("admin.deliverableQuantities.errors.loadDaily", {
          defaultValue: "Failed to load daily deliverable data",
        })
      );
      setDailyDeliverable(null);
      setAvailableWeight(null);
      setDailyLimitInput("");
    } finally {
      setLoadingDaily(false);
    }
  }, [selectedBranchId, selectedMealId, getToken, t]);

  useEffect(() => {
    void loadDailyData();
  }, [loadDailyData]);

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
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setDailyLimitInput(value);
    }
  };

  const handleSaveSizeWeights = async () => {
    if (!canManageDeliverableQuantities) {
      toast.error(t("common.accessDenied"));
      return;
    }
    if (!selectedBranchId || !selectedMealId) {
      toast.error(
        t("admin.deliverableQuantities.errors.selectBranchMeal", {
          defaultValue: "Please select a branch and meal first",
        })
      );
      return;
    }

    const invalidWeights = Object.entries(sizeWeights).filter(([, value]) => {
      if (value === "") return false;
      const num = parseFloat(value);
      return Number.isNaN(num) || num < 0;
    });

    if (invalidWeights.length > 0) {
      toast.error(
        t("admin.deliverableQuantities.errors.invalidWeights", {
          defaultValue: "All weights must be positive numbers",
        })
      );
      return;
    }

    try {
      setSavingSizeWeights(true);
      const token = await getToken();

      const promises = Object.entries(sizeWeights)
        .filter(([, value]) => value !== "")
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
      toast.success(
        t("admin.deliverableQuantities.toasts.savedWeights", {
          defaultValue: "Size weights saved successfully",
        })
      );
      setHasSizeWeightChanges(false);
      await loadDailyData();
    } catch (error: any) {
      console.error("Error saving size weights:", error);
      toast.error(
        t("admin.deliverableQuantities.errors.saveWeights", {
          defaultValue: "Failed to save size weights",
        })
      );
    } finally {
      setSavingSizeWeights(false);
    }
  };

  const handleSaveDailyLimit = async () => {
    if (!canManageDeliverableQuantities) {
      toast.error(t("common.accessDenied"));
      return;
    }
    if (!selectedBranchId || !selectedMealId) {
      toast.error(
        t("admin.deliverableQuantities.errors.selectBranchMeal", {
          defaultValue: "Please select a branch and meal first",
        })
      );
      return;
    }

    if (dailyLimitInput === "") {
      toast.error(
        t("admin.deliverableQuantities.errors.enterDailyWeight", {
          defaultValue: "Please enter a daily deliverable weight",
        })
      );
      return;
    }

    const weight = parseFloat(dailyLimitInput);
    if (Number.isNaN(weight) || weight < 0) {
      toast.error(
        t("admin.deliverableQuantities.errors.invalidDailyWeight", {
          defaultValue: "Daily deliverable weight must be a positive number",
        })
      );
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

      toast.success(
        t("admin.deliverableQuantities.toasts.savedDaily", {
          defaultValue: "Daily limit saved successfully",
        })
      );

      await loadDailyData();
    } catch (error: any) {
      console.error("Error saving daily limit:", error);
      toast.error(
        t("admin.deliverableQuantities.errors.saveDaily", {
          defaultValue: "Failed to save daily limit",
        })
      );
    } finally {
      setSavingDailyLimit(false);
    }
  };

  const handleDeleteDailyLimit = async () => {
    if (!canManageDeliverableQuantities) {
      toast.error(t("common.accessDenied"));
      return;
    }
    if (!selectedBranchId || !selectedMealId) {
      toast.error(
        t("admin.deliverableQuantities.errors.selectBranchMeal", {
          defaultValue: "Please select a branch and meal first",
        })
      );
      return;
    }

    if (!dailyDeliverable) {
      toast.error(
        t("admin.deliverableQuantities.errors.noDailyLimit", {
          defaultValue: "No daily limit to delete",
        })
      );
      return;
    }

    try {
      setDeletingDailyLimit(true);
      const token = await getToken();

      await deliverableQuantityService.deleteDailyDeliverable(selectedBranchId, selectedMealId, token || undefined);

      toast.success(
        t("admin.deliverableQuantities.toasts.deletedDaily", {
          defaultValue: "Daily limit removed - meal now has unlimited deliverables",
        })
      );

      await loadDailyData();
    } catch (error: any) {
      console.error("Error deleting daily limit:", error);
      toast.error(
        t("admin.deliverableQuantities.errors.deleteDaily", {
          defaultValue: "Failed to delete daily limit",
        })
      );
    } finally {
      setDeletingDailyLimit(false);
    }
  };

  const formatWeight = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "—";
    return value.toFixed(2);
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-6 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.0} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.deliverableQuantities.loadingTitle", {
                defaultValue: "Loading Deliverable Quantities",
              })}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.deliverableQuantities.loadingDescription", {
                defaultValue: "Fetching branches, categories, and meal details.",
              })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!canViewDeliverableQuantities) {
    return (
      <div className="space-y-6 pb-6 p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("common.accessDenied")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isFilterComplete = Boolean(selectedBranchId && selectedCategoryId && selectedMealId);
  const selectedMeal = filteredMeals.find((m) => m.id === selectedMealId);
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="space-y-6 pb-6 overflow-x-hidden p-6">
      <PageHeader
        title={t("admin.deliverableQuantities.title", {
          defaultValue: "Deliverable Quantities",
        })}
        description={t("admin.deliverableQuantities.description", {
          defaultValue:
            "Manage per-branch meal size weights and daily deliverable limits. Limits apply every day automatically.",
        })}
        actions={
          <Button
            size="sm"
            onClick={handleSaveSizeWeights}
            disabled={!canManageDeliverableQuantities || !hasSizeWeightChanges || savingSizeWeights || !isFilterComplete}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            {savingSizeWeights ? (
              <>
                <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                {t("common.saving", { defaultValue: "Saving..." })}
              </>
            ) : (
              <>
                <Icon path={mdiContentSave} size={0.67} className="mr-2" />
                {t("admin.deliverableQuantities.actions.saveWeights", { defaultValue: "Save weights" })}
              </>
            )}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon path={mdiPackageVariant} size={0.83} />
              {t("admin.deliverableQuantities.filters.title", { defaultValue: "Filters" })}
            </CardTitle>
            <CardDescription>
              {t("admin.deliverableQuantities.filters.description", {
                defaultValue: "Select branch, category, and meal to configure limits.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("admin.deliverableQuantities.filters.branch", { defaultValue: "Branch" })}</Label>
              <Select value={selectedBranchId} onValueChange={handleBranchChange}>
                <SelectTrigger className="bg-transparent">
                  <SelectValue
                    placeholder={t("admin.deliverableQuantities.filters.selectBranch", {
                      defaultValue: "Select branch",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name || branch.code || t("common.unnamed", { defaultValue: "Unnamed" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("admin.deliverableQuantities.filters.category", { defaultValue: "Category" })}</Label>
              <Select
                value={selectedCategoryId}
                onValueChange={handleCategoryChange}
                disabled={!selectedBranchId || loadingMeals}
              >
                <SelectTrigger className="bg-transparent">
                  <SelectValue
                    placeholder={
                      loadingMeals
                        ? t("admin.deliverableQuantities.filters.loadingCategories", {
                            defaultValue: "Loading categories...",
                          })
                        : !selectedBranchId
                          ? t("admin.deliverableQuantities.filters.selectBranchFirst", {
                              defaultValue: "Select a branch first",
                            })
                          : t("admin.deliverableQuantities.filters.selectCategory", {
                              defaultValue: "Select category",
                            })
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
              {selectedBranchId && categories.length === 0 && !loadingMeals ? (
                <p className="text-xs text-muted-foreground">
                  {t("admin.deliverableQuantities.filters.noCategories", {
                    defaultValue: "No categories available for this branch",
                  })}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>{t("admin.deliverableQuantities.filters.meal", { defaultValue: "Meal" })}</Label>
              <Select value={selectedMealId} onValueChange={handleMealChange} disabled={!selectedCategoryId}>
                <SelectTrigger className="bg-transparent">
                  <SelectValue
                    placeholder={
                      !selectedBranchId
                        ? t("admin.deliverableQuantities.filters.selectBranchFirst", {
                            defaultValue: "Select a branch first",
                          })
                        : !selectedCategoryId
                          ? t("admin.deliverableQuantities.filters.selectCategoryFirst", {
                              defaultValue: "Select a category first",
                            })
                          : t("admin.deliverableQuantities.filters.selectMeal", {
                              defaultValue: "Select meal",
                            })
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
              {selectedCategoryId && filteredMeals.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("admin.deliverableQuantities.filters.noMeals", {
                    defaultValue: "No meals available in this category",
                  })}
                </p>
              ) : null}
            </div>

            {isFilterComplete && selectedMeal && selectedCategory ? (
              <div className="pt-2 border-t border-border space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("admin.deliverableQuantities.filters.selectedCategory", {
                    defaultValue: "Category:",
                  })}{" "}
                  <span className="font-medium text-foreground">{selectedCategory.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.deliverableQuantities.filters.selectedMeal", {
                    defaultValue: "Meal:",
                  })}{" "}
                  <span className="font-medium text-foreground">{selectedMeal.name}</span>
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              {t("admin.deliverableQuantities.sizeWeights.title", {
                defaultValue: "Size weights (kg)",
              })}
            </CardTitle>
            <CardDescription>
              {t("admin.deliverableQuantities.sizeWeights.description", {
                defaultValue: "Define how each size counts toward the daily deliverable total.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingSizes ? (
              <div className="flex items-center justify-center py-8">
                <Icon path={mdiRefresh} size={1.0} className="animate-spin text-pink-500" />
                <span className="ml-2 text-sm text-muted-foreground">
                  {t("admin.deliverableQuantities.sizeWeights.loading", {
                    defaultValue: "Loading sizes...",
                  })}
                </span>
              </div>
            ) : !isFilterComplete ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {t("admin.deliverableQuantities.sizeWeights.selectFilters", {
                  defaultValue: "Select a branch, category, and meal to view and configure size weights.",
                })}
              </div>
            ) : mealSizes.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {t("admin.deliverableQuantities.sizeWeights.empty", {
                  defaultValue: "No sizes configured for this meal.",
                })}
              </div>
            ) : (
              <div className="rounded-md border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3">
                        {t("admin.deliverableQuantities.sizeWeights.columns.size", { defaultValue: "Size" })}
                      </TableHead>
                      <TableHead className="w-1/3">
                        {t("admin.deliverableQuantities.sizeWeights.columns.type", { defaultValue: "Type" })}
                      </TableHead>
                      <TableHead className="w-1/3 text-right">
                        {t("admin.deliverableQuantities.sizeWeights.columns.weight", {
                          defaultValue: "Weight (kg)",
                        })}
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
                            onChange={(e) => handleSizeWeightChange(size.id, e.target.value)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {hasSizeWeightChanges && isFilterComplete && mealSizes.length > 0 ? (
              <p className="text-xs text-amber-500">
                {t("admin.deliverableQuantities.sizeWeights.unsaved", {
                  defaultValue: "You have unsaved changes to size weights.",
                })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("admin.deliverableQuantities.dailyLimit.title", {
              defaultValue: "Daily deliverable limit",
            })}
          </CardTitle>
          <CardDescription>
            {t("admin.deliverableQuantities.dailyLimit.description", {
              defaultValue:
                "Set the maximum deliverable weight per day. This limit applies automatically every day. Leave empty or remove to allow unlimited deliveries for this meal.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingDaily ? (
            <div className="flex items-center justify-center py-8">
              <Icon path={mdiRefresh} size={1.0} className="animate-spin text-pink-500" />
              <span className="ml-2 text-sm text-muted-foreground">
                {t("admin.deliverableQuantities.dailyLimit.loading", {
                  defaultValue: "Loading daily data...",
                })}
              </span>
            </div>
          ) : !isFilterComplete ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {t("admin.deliverableQuantities.dailyLimit.selectFilters", {
                defaultValue: "Select a branch, category, and meal to view and configure daily limits.",
              })}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>
                  {t("admin.deliverableQuantities.dailyLimit.weightLabel", {
                    defaultValue: "Daily deliverable weight (kg)",
                  })}
                </Label>
                <Input
                  placeholder={t("admin.deliverableQuantities.dailyLimit.weightPlaceholder", {
                    defaultValue: "e.g. 50 (leave empty for unlimited)",
                  })}
                  value={dailyLimitInput}
                  onChange={handleDailyLimitInputChange}
                  className="bg-transparent"
                />
                {!dailyDeliverable ? (
                  <p className="text-xs text-muted-foreground">
                    {t("admin.deliverableQuantities.dailyLimit.noLimit", {
                      defaultValue: "No limit set - unlimited deliveries allowed",
                    })}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>
                  {t("admin.deliverableQuantities.dailyLimit.consumedLabel", {
                    defaultValue: "Consumed today (kg)",
                  })}
                </Label>
                <Input value={formatWeight(availableWeight?.consumedWeight)} disabled className="bg-muted/50" />
              </div>

              <div className="space-y-2">
                <Label>
                  {t("admin.deliverableQuantities.dailyLimit.availableLabel", {
                    defaultValue: "Available today (kg)",
                  })}
                </Label>
                <Input
                  value={
                    availableWeight?.availableWeight !== null
                      ? formatWeight(availableWeight?.availableWeight)
                      : t("admin.deliverableQuantities.dailyLimit.unlimited", {
                          defaultValue: "∞ Unlimited",
                        })
                  }
                  disabled
                  className="bg-muted/50"
                />
              </div>

              <div className="md:col-span-3 flex justify-end gap-2">
                {dailyDeliverable ? (
                  <Button
                    variant="outline"
                    onClick={handleDeleteDailyLimit}
                    disabled={!canManageDeliverableQuantities || deletingDailyLimit}
                    className="border-destructive text-destructive hover:bg-destructive/10"
                  >
                    {deletingDailyLimit ? (
                      <>
                        <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                        {t("admin.deliverableQuantities.actions.removing", { defaultValue: "Removing..." })}
                      </>
                    ) : (
                      <>
                        <Icon path={mdiDelete} size={0.67} className="mr-2" />
                        {t("admin.deliverableQuantities.actions.removeLimit", {
                          defaultValue: "Remove limit",
                        })}
                      </>
                    )}
                  </Button>
                ) : null}

                <Button
                  onClick={handleSaveDailyLimit}
                  disabled={!canManageDeliverableQuantities || savingDailyLimit || !dailyLimitInput}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {savingDailyLimit ? (
                    <>
                      <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                      {t("common.saving", { defaultValue: "Saving..." })}
                    </>
                  ) : (
                    <>
                      <Icon path={mdiContentSave} size={0.67} className="mr-2" />
                      {t("admin.deliverableQuantities.actions.saveDaily", {
                        defaultValue: "Save daily limit",
                      })}
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
};

export default DeliverableQuantities;
