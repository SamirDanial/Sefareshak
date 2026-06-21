import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import Icon from "@mdi/react";
import {
  mdiArrowLeft,
  mdiPlus,
  mdiMinus,
  mdiRefresh,
  mdiChevronRight,
} from "@mdi/js";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/contexts/SettingsContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatPrice } from "@/utils/currency";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { toast } from "sonner";
import { useCartStore } from "@/store/cartStore";
import type { AddOn as CartAddOn, CartItem, OptionalIngredient as CartOptionalIngredient } from "@/store/cartStore";
import ApiService from "@/services/apiService";

const FALLBACK_IMG = "https://placehold.co/800x800?text=Deals";

export default function DealCustomization() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currency } = useSettings();
  const { branch } = useBranch();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get("edit") === "1";
  const editCartItemId = searchParams.get("cartItemId") || undefined;

  const { addItem, getItemById, replaceItem } = useCartStore();
  const { maxOrderQuantity, settings } = useSettings();

  const [deal, setDeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAddOns, setSelectedAddOns] = useState<CartAddOn[]>([]);
  const [selectedOptionalIngredients, setSelectedOptionalIngredients] = useState<CartOptionalIngredient[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showAddOnsSheet, setShowAddOnsSheet] = useState(false);
  const [showOptionalIngredientsSheet, setShowOptionalIngredientsSheet] = useState(false);

  useEffect(() => {
    const fetchDeal = async () => {
      if (!dealId) return;

      try {
        setLoading(true);
        setError(null);
        const apiService = ApiService.getInstance();
        const response = await apiService.getDeal(dealId, branch?.id);

        if (response.success) {
          setDeal(response.data);

          const optionalIngredients: CartOptionalIngredient[] =
            response.data.dealOptionalIngredients?.map((doi: any) => ({
              id: doi.optionalIngredient.id,
              name: doi.optionalIngredient.name,
              isIncluded: false,
            })) || [];

          if (isEditMode && editCartItemId) {
            const existing = getItemById(editCartItemId);
            if (existing) {
              setSelectedAddOns(existing.addOns || []);
              setSelectedOptionalIngredients(existing.optionalIngredients || optionalIngredients);
              setSpecialInstructions(existing.specialInstructions || "");
              setQuantity(existing.quantity || 1);
            } else {
              setSelectedOptionalIngredients(optionalIngredients);
            }
          } else {
            setSelectedOptionalIngredients(optionalIngredients);
          }
        } else {
          setError(t("dealCustomization.fetchError"));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("dealCustomization.errorOccurred"));
        console.error("Error fetching deal:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDeal();
  }, [dealId, branch?.id]);

  const getDealBaseTotal = (d: any): number => {
    const components = Array.isArray(d?.components) ? d.components : [];
    return components.reduce((sum: number, c: any) => {
      const v = c?.effectivePrice ?? c?.price;
      const n = typeof v === "number" ? v : parseFloat(String(v || 0));
      const q = c?.quantity !== undefined && c?.quantity !== null ? Number(c.quantity) : 1;
      const qty = Number.isFinite(q) && q > 0 ? q : 1;
      return sum + (isNaN(n) ? 0 : n) * qty;
    }, 0);
  };

  const totalPrice = useMemo(() => {
    if (!deal) return 0;
    const base = getDealBaseTotal(deal);
    const addOnsTotal = selectedAddOns.reduce((sum, addOn) => {
      const addOnQuantity = addOn.quantity || 1;
      return sum + addOn.price * addOnQuantity;
    }, 0);
    return base + addOnsTotal;
  }, [deal, selectedAddOns]);

  const handleAddOnToggle = (addOn: any) => {
    const v = addOn?.effectiveBasePrice ?? addOn?.price;
    const p = typeof v === "number" ? v : parseFloat(String(v || 0));

    const addOnObj: CartAddOn = {
      id: addOn.id,
      name: addOn.name,
      price: isNaN(p) ? 0 : p,
      type: addOn.type,
    };

    setSelectedAddOns((prev) =>
      prev.find((a) => a.id === addOnObj.id)
        ? prev.filter((a) => a.id !== addOnObj.id)
        : [...prev, addOnObj]
    );
  };

  const handleQuantityChange = (addOnId: string, newQuantity: number) => {
    const addOnRow = deal?.dealAddOns?.find((da: any) => da.addOn?.id === addOnId);
    const addOn = addOnRow?.addOn;
    if (!addOn) return;

    const v = addOn?.effectiveBasePrice ?? addOn?.price;
    const p = typeof v === "number" ? v : parseFloat(String(v || 0));

    const addOnObj: CartAddOn = {
      id: addOn.id,
      name: addOn.name,
      price: isNaN(p) ? 0 : p,
      type: addOn.type,
      quantity: newQuantity,
    };

    setSelectedAddOns((prev) => {
      if (newQuantity === 0) return prev.filter((a) => a.id !== addOnId);
      const existingIndex = prev.findIndex((a) => a.id === addOnId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = addOnObj;
        return updated;
      }
      return [...prev, addOnObj];
    });
  };

  const toggleOptionalIngredient = (ingredientId: string) => {
    const canExclude = settings?.allowExcludeOptionalIngredients ?? true;
    if (!canExclude) return;

    setSelectedOptionalIngredients((prev) =>
      prev.map((ing) =>
        ing.id === ingredientId ? { ...ing, isIncluded: !ing.isIncluded } : ing
      )
    );
  };

  const handleAddToCart = async () => {
    if (!deal) return;

    setIsAddingToCart(true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const isEditing = isEditMode && !!editCartItemId;
    const itemId = isEditing ? (editCartItemId as string) : `${deal.id}-${Date.now()}`;

    const cartItem: CartItem = {
      id: itemId,
      itemType: "DEAL",
      dealId: deal.id,
      name: deal.name,
      basePrice: getDealBaseTotal(deal),
      size: "",
      addOns: selectedAddOns,
      optionalIngredients: selectedOptionalIngredients,
      specialInstructions,
      image: deal.image
        ? isExternalImage(deal.image)
          ? deal.image
          : getOptimizedImageUrl(deal.image)
        : FALLBACK_IMG,
      quantity,
    };

    try {
      if (isEditing) {
        replaceItem(itemId, cartItem);
        toast.success(t("dealCustomization.cartUpdated"), {
          duration: 1800,
          style: {
            background: "rgba(34, 197, 94, 0.9)",
            color: "#ffffff",
            border: "1px solid rgba(34, 197, 94, 0.5)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
          },
        });
        navigate(-1);
        return;
      }

      addItem(cartItem, maxOrderQuantity);
      toast.success(t("dealCustomization.addedToCart"), {
        duration: 2000,
        style: {
          background: "rgba(34, 197, 94, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(34, 197, 94, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
        },
      });

      navigate(`/deal-category/${encodeURIComponent(deal.categoryId)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("dealCustomization.failedToAdd"), {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
        },
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
          </button>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              {t("dealCustomization.loadingDetails")}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.0} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("dealCustomization.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("dealCustomization.loadingDescription")}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !deal) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">{t("dealCustomization.notFound")}</h2>
          <p className="text-red-500 mb-4">{error}</p>
          <Link to="/" className="text-pink-500 hover:text-pink-600">
            {t("dealCustomization.backToHome")}
          </Link>
        </div>
      </div>
    );
  }

  const dealAddOns = Array.isArray(deal?.dealAddOns) ? deal.dealAddOns : [];
  const dealOptionalIngredients = Array.isArray(deal?.dealOptionalIngredients) ? deal.dealOptionalIngredients : [];

  return (
    <section className="space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30 hover:scale-105 transition-transform"
        >
          <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
          {deal.name}
        </h1>
      </div>

      <div className="w-screen sm:hidden relative left-1/2 -translate-x-1/2">
        <div className="w-full h-[250px] relative">
          <img
            src={
              deal.image
                ? isExternalImage(deal.image)
                  ? deal.image
                  : getOptimizedImageUrl(deal.image)
                : FALLBACK_IMG
            }
            alt={deal.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-4">
            <p className="text-base font-semibold text-pink-400">{deal.description}</p>
          </div>
        </div>
      </div>

      <Card className="hidden sm:block overflow-hidden shadow-xl border-0 bg-gradient-to-br from-pink-50 to-rose-50">
        <CardContent className="p-0">
          <div className="aspect-video relative">
            <img
              src={
                deal.image
                  ? isExternalImage(deal.image)
                    ? deal.image
                    : getOptimizedImageUrl(deal.image)
                  : FALLBACK_IMG
              }
              alt={deal.name}
              className="h-full w-full object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-4">
              <p className="text-base font-semibold text-pink-400">{deal.description}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {dealOptionalIngredients.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1 w-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"></div>
              <h2 className="font-bold text-lg text-foreground">
                {settings?.allowExcludeOptionalIngredients ?? true
                  ? t("dealCustomization.optionalIngredients")
                  : t("dealCustomization.requiredIngredients")}
              </h2>
            </div>
            <button
              onClick={() => setShowOptionalIngredientsSheet(true)}
              className="text-sm font-semibold text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 transition-colors flex items-center gap-1"
            >
              {t("dealCustomization.showMore")}
              <Icon path={mdiChevronRight} size={0.67} />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-1 w-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"></div>
            <h2 className="font-bold text-lg text-foreground">{t("dealCustomization.addExtras")}</h2>
          </div>
          {dealAddOns.length > 0 && (
            <button
              onClick={() => setShowAddOnsSheet(true)}
              className="text-sm font-semibold text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 transition-colors flex items-center gap-1"
            >
              {t("dealCustomization.showMore")}
              <Icon path={mdiChevronRight} size={0.67} />
            </button>
          )}
        </div>

        {dealAddOns.length > 0 ? (
          <div className="grid gap-3">
            {dealAddOns.slice(0, 4).map((row: any) => {
              const addOn = row.addOn;
              if (!addOn) return null;
              const isSelected = selectedAddOns.some((a) => a.id === addOn.id);
              const v = addOn?.effectiveBasePrice ?? addOn?.price;
              const p = typeof v === "number" ? v : parseFloat(String(v || 0));

              return (
                <Card
                  key={addOn.id}
                  className={`overflow-hidden border transition-colors ${
                    isSelected
                      ? "border-pink-500 bg-pink-50/40 dark:bg-pink-500/10"
                      : "border-border"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-foreground">{addOn.name}</p>
                        {addOn.description && (
                          <p className="text-sm text-muted-foreground">{addOn.description}</p>
                        )}
                        <p className="text-sm font-semibold text-pink-600 mt-1">
                          {formatPrice(isNaN(p) ? 0 : p, currency)}
                        </p>
                      </div>
                      <Button
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleAddOnToggle(addOn)}
                        className={
                          isSelected
                            ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white"
                            : ""
                        }
                      >
                        {isSelected ? t("dealCustomization.selected") : t("dealCustomization.add")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t("dealCustomization.noAddons")}</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-1 w-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"></div>
          <h2 className="font-bold text-lg text-foreground">{t("mealCustomization.specialInstructions")}</h2>
        </div>
        <div className="relative">
          <textarea
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            placeholder={t("mealCustomization.specialInstructionsPlaceholder")}
            className="w-full p-4 rounded-xl border-2 border-border focus:border-pink-500 focus:outline-none resize-none transition-all duration-200 bg-card text-foreground placeholder:text-muted-foreground"
            rows={3}
          />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-background via-background to-background/95 backdrop-blur-sm border-t border-border">
        <div className="max-w-screen-sm mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground font-medium">
                {t("dealCustomization.total")}
              </div>
              <div className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
                {formatPrice(totalPrice * quantity, currency)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-3 hover:scale-110 transition-transform duration-200 shadow-lg shadow-pink-500/30"
              >
                <Icon path={mdiMinus} size={0.83} className="text-white" />
              </button>
              <div className="bg-gradient-to-r from-pink-500/10 to-rose-500/10 rounded-xl px-6 py-3 border-2 border-pink-500/20">
                <span className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                  {quantity}
                </span>
              </div>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-3 hover:scale-110 transition-transform duration-200 shadow-lg shadow-pink-500/30"
              >
                <Icon path={mdiPlus} size={0.83} className="text-white" />
              </button>
            </div>
          </div>

          <Button
            onClick={handleAddToCart}
            disabled={isAddingToCart}
            className={`w-full bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white shadow-2xl shadow-rose-500/40 py-4 text-lg font-bold rounded-xl transition-all duration-300 ${
              isAddingToCart
                ? "opacity-75 scale-95 cursor-not-allowed"
                : "hover:scale-[1.02] hover:shadow-rose-500/60 active:scale-95"
            }`}
          >
            {isAddingToCart ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {t("dealCustomization.adding")}
              </div>
            ) : isEditMode ? (
              t("mealCustomization.updateItem")
            ) : (
              t("dealCustomization.addToCart")
            )}
          </Button>
        </div>
      </div>

      <Sheet open={showAddOnsSheet} onOpenChange={setShowAddOnsSheet}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <div className="px-4 pb-6 pt-8">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-xl font-bold text-pink-500">
                {t("dealCustomization.addExtras")}
              </SheetTitle>
              {selectedAddOns.length > 0 && (
                <SheetDescription className="text-pink-400 mt-1">
                  {selectedAddOns.length} {t("dealCustomization.selected")}
                </SheetDescription>
              )}
            </SheetHeader>

            {dealAddOns.length > 0 ? (
              <div className="space-y-3">
                {dealAddOns.map((row: any) => {
                  const addOn = row.addOn;
                  if (!addOn) return null;
                  const isSelected = selectedAddOns.some((a) => a.id === addOn.id);
                  const selected = selectedAddOns.find((a) => a.id === addOn.id);
                  const currentQty = selected?.quantity || (isSelected ? 1 : 0);

                  const v = addOn?.effectiveBasePrice ?? addOn?.price;
                  const p = typeof v === "number" ? v : parseFloat(String(v || 0));

                  return (
                    <Card
                      key={addOn.id}
                      className={`overflow-hidden border transition-colors ${
                        isSelected
                          ? "border-pink-500 bg-pink-50/40 dark:bg-pink-500/10"
                          : "border-border"
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-semibold text-foreground">{addOn.name}</p>
                            {addOn.description && (
                              <p className="text-sm text-muted-foreground">{addOn.description}</p>
                            )}
                            <p className="text-sm font-semibold text-pink-600 mt-1">
                              {formatPrice(isNaN(p) ? 0 : p, currency)}
                            </p>
                          </div>

                          {addOn.type === "QUANTITY" ? (
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleQuantityChange(addOn.id, Math.max(0, currentQty - 1))}
                                className="h-9 w-9 p-0"
                              >
                                <Icon path={mdiMinus} size={0.67} />
                              </Button>
                              <span className="w-6 text-center font-semibold">
                                {currentQty}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleQuantityChange(addOn.id, currentQty + 1)}
                                className="h-9 w-9 p-0"
                              >
                                <Icon path={mdiPlus} size={0.67} />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              onClick={() => handleAddOnToggle(addOn)}
                              className={
                                isSelected
                                  ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white"
                                  : ""
                              }
                            >
                              {isSelected ? t("dealCustomization.selected") : t("dealCustomization.add")}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>{t("dealCustomization.noAddons")}</p>
              </div>
            )}

            <div className="mt-5">
              <Button
                onClick={() => setShowAddOnsSheet(false)}
                className="w-full bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white"
              >
                {t("dealCustomization.done")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showOptionalIngredientsSheet} onOpenChange={setShowOptionalIngredientsSheet}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <div className="px-4 pb-6 pt-8">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-xl font-bold text-pink-500">
                {settings?.allowExcludeOptionalIngredients ?? true
                  ? t("dealCustomization.optionalIngredients")
                  : t("dealCustomization.requiredIngredients")}
              </SheetTitle>
              {(settings?.allowExcludeOptionalIngredients ?? true) && (
                <SheetDescription className="text-pink-400 mt-1">
                  {selectedOptionalIngredients.filter((i) => i.isIncluded).length} {t("dealCustomization.included")} /{" "}
                  {selectedOptionalIngredients.filter((i) => !i.isIncluded).length} {t("dealCustomization.excluded")}
                </SheetDescription>
              )}
            </SheetHeader>

            {dealOptionalIngredients.length > 0 ? (
              <div className="space-y-3">
                {dealOptionalIngredients.map((row: any) => {
                  const ingredient = row.optionalIngredient;
                  if (!ingredient) return null;
                  const selected = selectedOptionalIngredients.find((i) => i.id === ingredient.id);
                  const isIncluded = selected ? selected.isIncluded : false;

                  return (
                    <div
                      key={ingredient.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border p-4"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">{ingredient.name}</p>
                        {ingredient.description && (
                          <p className="text-sm text-muted-foreground">{ingredient.description}</p>
                        )}
                      </div>
                      <div className="pt-1">
                        <Checkbox
                          checked={isIncluded}
                          onCheckedChange={() => toggleOptionalIngredient(ingredient.id)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>{t("dealCustomization.noOptionalIngredients")}</p>
              </div>
            )}

            <div className="mt-5">
              <Button
                onClick={() => setShowOptionalIngredientsSheet(false)}
                className="w-full bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white"
              >
                {t("dealCustomization.done")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
