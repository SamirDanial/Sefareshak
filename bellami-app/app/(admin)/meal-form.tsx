import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Keyboard,
  Alert,
} from "react-native";
import { Switch } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import {
  mealService,
  type Meal,
  type MealFormData,
  type MealSize,
  type MealBranchPrice,
} from "@/src/services/mealService";
import { categoryService, type Category } from "@/src/services/categoryService";
import { addonService, type Addon } from "@/src/services/addonService";
import {
  declarationService,
  type Declaration,
} from "@/src/services/declarationService";
import {
  optionalIngredientService,
  type OptionalIngredient,
} from "@/src/services/optionalIngredientService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import ApiService from "@/src/services/apiService";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const parsePrice = (price: string | number): number => {
  if (typeof price === "number") return price;
  if (typeof price === "string") {
    const parsed = parseFloat(price);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const getOptimizedImageUrl = (imagePath: string): string => {
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

export default function MealFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; categoryId?: string }>();
  const { getToken } = useAuthRole();
  const isEditing = !!params.id;
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  };

  const [loading, setLoading] = useState(isEditing);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [optionalIngredients, setOptionalIngredients] = useState<
    OptionalIngredient[]
  >([]);
  const [addonSearchTerm, setAddonSearchTerm] = useState("");
  const [declarationSearchTerm, setDeclarationSearchTerm] = useState("");
  const [optionalIngredientSearchTerm, setOptionalIngredientSearchTerm] =
    useState("");
  const [showAddonsModal, setShowAddonsModal] = useState(false);
  const [addonFilterType, setAddonFilterType] = useState<"all" | "category" | "available">("all");
  const [showDeclarationsModal, setShowDeclarationsModal] = useState(false);
  const [declarationFilterType, setDeclarationFilterType] = useState<"all" | "available">("all");
  const [showOptionalIngredientsModal, setShowOptionalIngredientsModal] = useState(false);
  const [optionalIngredientFilterType, setOptionalIngredientFilterType] = useState<"all" | "available">("all");
  const [formData, setFormData] = useState<
    Omit<MealFormData, "basePrice"> & { id?: string; basePrice: number | null }
  >({
    name: "",
    description: "",
    basePrice: null,
    taxPercentage: null,
    categoryId: "",
    image: undefined,
    sizes: [],
    addOnIds: [],
    declarationIds: [],
    optionalIngredientIds: [],
    excludedBranches: [],
    isFeatured: false,
    isDrink: false,
  });
  const [basePriceText, setBasePriceText] = useState("");
  const [sizePriceTexts, setSizePriceTexts] = useState<{
    [index: number]: string;
  }>({});
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showAddSizeModal, setShowAddSizeModal] = useState(false);
  const [newSize, setNewSize] = useState({
    name: "",
    sizeType: "M" as "S" | "M" | "L" | "XL",
    price: null as number | null,
    taxPercentage: null as number | null,
  });
  const [newSizePriceText, setNewSizePriceText] = useState("");
  const [newSizeTaxText, setNewSizeTaxText] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchPrices, setBranchPrices] = useState<MealBranchPrice[]>([]);
  const [loadingBranchPrices, setLoadingBranchPrices] = useState(false);
  const [branchPickerVisible, setBranchPickerVisible] = useState(false);
  const [branchPickerMode, setBranchPickerMode] = useState<"branchPrice" | "excludedBranches">(
    "branchPrice"
  );
  const [branchPickerAvailable, setBranchPickerAvailable] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [tempExcludedBranches, setTempExcludedBranches] = useState<string[]>([]);
  const [editingBranchPrice, setEditingBranchPrice] = useState<{
    branchId: string;
    basePrice: string;
    taxPercentage: string;
  } | null>(null);
  const [branchPriceToDelete, setBranchPriceToDelete] = useState<{
    branchId: string;
    branchName: string;
  } | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "success",
  });

  useEffect(() => {
    loadBranches();
    loadCategoriesAndAddons();
    if (isEditing && params.id) {
      loadMeal(params.id);
    }

    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [params.id]);

  useEffect(() => {
    if (isEditing) return;
    if (!params.categoryId) return;
    setFormData((prev) => ({ ...prev, categoryId: params.categoryId || "" }));
  }, [isEditing, params.categoryId]);

  // Request camera and media library permissions on mount
  useEffect(() => {
    (async () => {
      const cameraPermission =
        await ImagePicker.requestCameraPermissionsAsync();
      const mediaPermission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!cameraPermission.granted || !mediaPermission.granted) {
        Alert.alert(
          t("admin.menuManagement.permissionsRequired"),
          t("admin.menuManagement.grantPermissions")
        );
      }
    })();
  }, []);

  const handlePickImage = async (mode: "library" | "camera") => {
    try {
      setShowImagePickerModal(false);
      let result;

      if (mode === "camera") {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets[0]) {
        await handleEditAndUploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.pickImageError"),
        type: "error",
      });
    }
  };

  const handleEditAndUploadImage = async (imageUri: string) => {
    try {
      setIsUploadingImage(true);

      // Resize and optimize image for restaurant use (food photos should be high quality)
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          { resize: { width: 1200 } }, // Optimal size for food photos
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Upload the edited image
      await uploadImageToServer(manipulatedImage.uri);
    } catch (error) {
      console.error("Error editing/uploading image:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.processImageError"),
        type: "error",
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const uploadImageToServer = async (imageUri: string) => {
    try {
      const token = await getToken();

      // Create form data for upload
      const uploadFormData = new FormData();

      // Get filename from URI or generate one
      const filename = imageUri.split("/").pop() || `meal_${Date.now()}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : "image/jpeg";

      // @ts-ignore - React Native FormData typing
      uploadFormData.append("image", {
        uri: imageUri,
        name: filename,
        type,
      } as any);

      // Upload to backend
      const response = await fetch(`${API_BASE_URL}/api/upload/image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: uploadFormData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setFormData((prev) => ({ ...prev, image: result.data.filename }));
        setToast({
          visible: true,
          message: t("admin.menuManagement.imageUploadedSuccess"),
          type: "success",
        });
      } else {
        throw new Error("Invalid response");
      }
    } catch (error) {
      console.error("Upload error:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.uploadImageError"),
        type: "error",
      });
    }
  };

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const apiService = ApiService.getInstance();
      try {
        const result = await apiService.get(
          "/api/admin/branches",
          token || undefined
        );
        if (result.success && result.data) {
          setBranches(result.data);
          return;
        }
      } catch (err: any) {
        const msg = String(err?.message || "");
        const isForbidden = msg.includes("status: 403");
        if (!isForbidden) {
          throw err;
        }
      }

      // Fallback for employees without BRANCHES:VIEW: load only their assigned branches.
      const fallbackResult = await apiService.get(
        "/api/user/branches/my",
        token || undefined
      );
      if (fallbackResult.success && fallbackResult.data) {
        setBranches(fallbackResult.data);
      }
    } catch (error) {
      console.error("Error loading branches:", error);
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadBranchPrices = async (mealId: string) => {
    if (!isEditing) return;
    try {
      setLoadingBranchPrices(true);
      const token = await getToken();
      const prices = await mealService.getMealBranchPrices(mealId, token || undefined);
      setBranchPrices(prices);
    } catch (error) {
      console.error("Failed to load branch prices:", error);
      setBranchPrices([]);
    } finally {
      setLoadingBranchPrices(false);
    }
  };

  const loadCategoriesAndAddons = async () => {
    try {
      const token = await getToken();
      const [
        categoriesData,
        addonsData,
        declarationsData,
        optionalIngredientsData,
      ] = await Promise.all([
        categoryService.getCategories(
          1,
          100,
          "",
          "createdAt",
          "desc",
          token || undefined
        ),
        addonService.getAddons(
          1,
          100,
          "",
          "createdAt",
          "desc",
          token || undefined
        ),
        declarationService.getAllDeclarations(undefined, token || undefined),
        optionalIngredientService.getAllOptionalIngredients(token || undefined),
      ]);
      setCategories(categoriesData.categories);
      setAddons(addonsData.addons);
      setDeclarations(declarationsData);
      setOptionalIngredients(
        Array.isArray(optionalIngredientsData) ? optionalIngredientsData : []
      );
    } catch (error) {
      console.error(
        "Error loading categories, addons, declarations, and optional ingredients:",
        error
      );
    }
  };

  const loadMeal = async (id: string) => {
    try {
      setLoading(true);
      setAddonFilterType("all"); // Reset filter when loading meal
      const token = await getToken();
      const meal = await mealService.getMealById(id, token || undefined);
      const loadedBasePrice = parsePrice(meal.basePrice);
      const loadedSizes = meal.mealSizes.map((size) => ({
        id: size.id,
        name: size.name,
        sizeType: size.sizeType || "M",
        price: parsePrice(size.price),
        taxPercentage: size.taxPercentage || null,
      }));
      setFormData({
        id: meal.id,
        name: meal.name,
        description: meal.description || "",
        basePrice: loadedBasePrice,
        taxPercentage: meal.taxPercentage,
        categoryId: meal.categoryId,
        image: meal.image || undefined,
        sizes: loadedSizes,
        addOnIds: meal.mealAddOns.map((addon) => addon.addOn.id),
        declarationIds:
          meal.mealDeclarations?.map((decl) => decl.declaration.id) || [],
        optionalIngredientIds:
          meal.mealOptionalIngredients?.map(
            (moi) => moi.optionalIngredient.id
          ) || [],
        excludedBranches: (meal as any).excludedBranches || [],
        isFeatured: meal.isFeatured ?? false,
        isDrink: Boolean((meal as any).isDrink),
      });
      // Load branch prices for editing
      loadBranchPrices(meal.id);
      setBasePriceText(loadedBasePrice.toString());
      // Set price texts for all sizes
      const priceTexts: { [index: number]: string } = {};
      loadedSizes.forEach((size, index) => {
        priceTexts[index] = size.price.toString();
      });
      setSizePriceTexts(priceTexts);
    } catch (error) {
      console.error("Error loading meal:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.loadMealError"),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

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

  const handleSaveBranchPrice = async () => {
    if (!editingBranchPrice || !formData.id) return;
    
    try {
      const token = await getToken();
      const basePrice = parseFloat(editingBranchPrice.basePrice);
      if (isNaN(basePrice) || basePrice < 0) {
        setToast({
          visible: true,
          message: t("admin.menuManagement.validPriceRequired"),
          type: "error",
        });
        return;
      }

      await mealService.upsertMealBranchPrice(
        formData.id,
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
      await loadBranchPrices(formData.id);
      setEditingBranchPrice(null);
      setToast({
        visible: true,
        message: t("admin.menuManagement.branchPriceSaved"),
        type: "success",
      });
    } catch (error) {
      console.error("Failed to save branch price:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.failedToSaveBranchPrice"),
        type: "error",
      });
    }
  };

  const handleDeleteBranchPrice = async () => {
    if (!branchPriceToDelete || !formData.id) return;

    try {
      const token = await getToken();
      await mealService.deleteMealBranchPrice(formData.id, branchPriceToDelete.branchId, token || undefined);
      // Reload branch prices
      await loadBranchPrices(formData.id);
      setBranchPriceToDelete(null);
      setToast({
        visible: true,
        message: t("admin.menuManagement.branchPriceDeleted"),
        type: "success",
      });
    } catch (error) {
      console.error("Failed to delete branch price:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.failedToDeleteBranchPrice"),
        type: "error",
      });
    }
  };

  const handleSubmit = async () => {
    if (
      !formData.name ||
      !formData.categoryId ||
      formData.basePrice === null ||
      formData.basePrice === undefined
    ) {
      setToast({
        visible: true,
        message: t("admin.menuManagement.fillRequiredFields"),
        type: "error",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();
      const submitData = {
        ...formData,
        basePrice: formData.basePrice ?? 0,
        excludedBranches: formData.excludedBranches || [],
      };
      if (formData.id) {
        await mealService.updateMeal(
          formData.id,
          submitData,
          token || undefined
        );
        setToast({
          visible: true,
          message: t("admin.menuManagement.mealUpdatedSuccess"),
          type: "success",
        });
      } else {
        await mealService.createMeal(submitData, token || undefined);
        setToast({
          visible: true,
          message: t("admin.menuManagement.mealCreatedSuccess"),
          type: "success",
        });
      }
      // Navigate back after a short delay
      setTimeout(() => {
        router.back();
      }, 500);
    } catch (error) {
      console.error("Error saving meal:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.saveMealError"),
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAddSizeModal = () => {
    setNewSize({ name: "", sizeType: "M", price: null, taxPercentage: null });
    setNewSizePriceText("");
    setNewSizeTaxText("");
    setShowAddSizeModal(true);
  };

  const closeAddSizeModal = () => {
    Keyboard.dismiss();
    setShowAddSizeModal(false);
    setNewSize({ name: "", sizeType: "M", price: null, taxPercentage: null });
    setNewSizePriceText("");
    setNewSizeTaxText("");
  };

  const handleAddSize = () => {
    if (!newSize.name) {
      setToast({
        visible: true,
        message: t("admin.menuManagement.enterSizeName"),
        type: "error",
      });
      return;
    }
    if (newSize.price === null || newSize.price === undefined) {
      setToast({
        visible: true,
        message: t("admin.menuManagement.enterPrice"),
        type: "error",
      });
      return;
    }

    const newSizes = [
      ...(formData.sizes || []),
      {
        name: newSize.name,
        sizeType: newSize.sizeType || "M",
        price: newSize.price,
        taxPercentage: newSize.taxPercentage,
      },
    ];
    setFormData({ ...formData, sizes: newSizes });
    // Initialize text for the new size price
    const newIndex = newSizes.length - 1;
    setSizePriceTexts({
      ...sizePriceTexts,
      [newIndex]: newSizePriceText || newSize.price.toString(),
    });
    closeAddSizeModal();
  };

  const removeSize = (index: number) => {
    const newSizes = formData.sizes?.filter((_, i) => i !== index) || [];
    setFormData({ ...formData, sizes: newSizes });
    // Remove the text state for this size and reindex the rest
    const newTexts: { [index: number]: string } = {};
    newSizes.forEach((_, newIndex) => {
      const oldIndex = newIndex >= index ? newIndex + 1 : newIndex;
      if (sizePriceTexts[oldIndex] !== undefined) {
        newTexts[newIndex] = sizePriceTexts[oldIndex];
      }
    });
    setSizePriceTexts(newTexts);
  };

  const updateSize = (
    index: number,
    field: "name" | "sizeType" | "price" | "taxPercentage",
    value: string | number | null
  ) => {
    const newSizes = [...(formData.sizes || [])];
    newSizes[index] = { ...newSizes[index], [field]: value };
    setFormData({ ...formData, sizes: newSizes });
  };

  const toggleAddon = (addonId: string) => {
    const currentAddonIds = formData.addOnIds || [];
    const newAddonIds = currentAddonIds.includes(addonId)
      ? currentAddonIds.filter((id) => id !== addonId)
      : [...currentAddonIds, addonId];
    setFormData({ ...formData, addOnIds: newAddonIds });
  };

  // Select all addons that belong to the meal's category
  const selectAllCategoryAddons = () => {
    if (!formData.categoryId) return;
    
    // Find all addons that belong to the selected category
    const categoryAddonIds = addons
      .filter((addon) => {
        const addonCategoryIds = addon.addonCategories?.map(ac => ac.category.id) || [];
        return addonCategoryIds.includes(formData.categoryId);
      })
      .map((addon) => addon.id);
    
    // Merge with existing selected addons (avoid duplicates)
    const currentAddonIds = formData.addOnIds || [];
    const newAddonIds = [...new Set([...currentAddonIds, ...categoryAddonIds])];
    
    setFormData({ ...formData, addOnIds: newAddonIds });
  };

  const toggleDeclaration = (declarationId: string) => {
    const currentDeclarationIds = formData.declarationIds || [];
    const newDeclarationIds = currentDeclarationIds.includes(declarationId)
      ? currentDeclarationIds.filter((id) => id !== declarationId)
      : [...currentDeclarationIds, declarationId];
    setFormData({ ...formData, declarationIds: newDeclarationIds });
  };

  const toggleOptionalIngredient = (optionalIngredientId: string) => {
    const currentOptionalIngredientIds = formData.optionalIngredientIds || [];
    const newOptionalIngredientIds = currentOptionalIngredientIds.includes(
      optionalIngredientId
    )
      ? currentOptionalIngredientIds.filter((id) => id !== optionalIngredientId)
      : [...currentOptionalIngredientIds, optionalIngredientId];
    setFormData({
      ...formData,
      optionalIngredientIds: newOptionalIngredientIds,
    });
  };

  const filteredAddons = addons.filter((addon) => {
    const matchesSearch =
      addon.name.toLowerCase().includes(addonSearchTerm.toLowerCase()) ||
      addon.description?.toLowerCase().includes(addonSearchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // Filter by type
    if (addonFilterType === "category" && formData.categoryId) {
      // Check if addon belongs to the selected category (many-to-many relationship)
      const addonCategoryIds = addon.addonCategories?.map(ac => ac.category.id) || [];
      const matchesCategory = addonCategoryIds.includes(formData.categoryId);
      if (!matchesCategory) return false;
    } else if (addonFilterType === "available") {
      // Show only selected addons
      return formData.addOnIds?.includes(addon.id);
    }

    return true;
  });

  const filteredDeclarations = declarations.filter((declaration) => {
    const matchesSearch =
      declaration.name
        .toLowerCase()
        .includes(declarationSearchTerm.toLowerCase()) ||
      declaration.type
        ?.toLowerCase()
        .includes(declarationSearchTerm.toLowerCase()) ||
      declaration.description
        ?.toLowerCase()
        .includes(declarationSearchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // Filter by type
    if (declarationFilterType === "available") {
      // Show only selected declarations
      return formData.declarationIds?.includes(declaration.id);
    }

    return true;
  });

  const filteredOptionalIngredients = optionalIngredients.filter(
    (ingredient) => {
      const matchesSearch =
        ingredient.name
          .toLowerCase()
          .includes(optionalIngredientSearchTerm.toLowerCase()) ||
        ingredient.description
          ?.toLowerCase()
          .includes(optionalIngredientSearchTerm.toLowerCase());

      if (!matchesSearch) return false;

      // Filter by type
      if (optionalIngredientFilterType === "available") {
        // Show only selected optional ingredients
        return formData.optionalIngredientIds?.includes(ingredient.id);
      }

      return true;
    }
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={
            isEditing
              ? t("admin.menuManagement.editMeal")
              : t("admin.menuManagement.createNewMeal")
          }
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.menuManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AnimatedHeader
        title={
          isEditing
            ? t("admin.menuManagement.editMeal")
            : t("admin.menuManagement.createNewMeal")
        }
        onBackPress={() => router.back()}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Meal Name */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.mealName")}{" "}
            <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t("admin.menuManagement.enterMealName")}
            placeholderTextColor="#6B7280"
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
          />
        </View>

        {/* Base Price */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.basePrice")}{" "}
            <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t("admin.menuManagement.enterBasePrice")}
            placeholderTextColor="#6B7280"
            keyboardType="decimal-pad"
            value={basePriceText}
            onChangeText={(text) => {
              // Only allow numbers and decimal point
              let cleaned = text.replace(/[^0-9.]/g, "");
              // Only allow one decimal point
              const parts = cleaned.split(".");
              if (parts.length > 2) {
                cleaned = parts[0] + "." + parts.slice(1).join("");
              }
              // Update text display
              setBasePriceText(cleaned);
              // Update form data only if it's a valid number
              if (cleaned === "" || cleaned === ".") {
                setFormData({ ...formData, basePrice: null });
              } else {
                const numValue = parseFloat(cleaned);
                if (!isNaN(numValue)) {
                  setFormData({ ...formData, basePrice: numValue });
                }
              }
            }}
          />
        </View>

        {/* Tax Percentage */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.taxPercentage")}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t("admin.menuManagement.taxPercentagePlaceholder")}
            placeholderTextColor="#6B7280"
            keyboardType="decimal-pad"
            value={formData.taxPercentage?.toString() || ""}
            onChangeText={(text) => {
              // Only allow numbers and decimal point
              const cleaned = text.replace(/[^0-9.]/g, "");
              // Only allow one decimal point
              const parts = cleaned.split(".");
              const formatted =
                parts.length > 2
                  ? parts[0] + "." + parts.slice(1).join("")
                  : cleaned;
              setFormData({
                ...formData,
                taxPercentage: formatted ? parseFloat(formatted) : null,
              });
            }}
          />
          <Text style={styles.inputHint}>
            {t("admin.menuManagement.taxPercentageHint")}
          </Text>
        </View>

        {/* Description */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.descriptionLabel")}
          </Text>
          <TextInput
            style={styles.textArea}
            placeholder={t("admin.menuManagement.enterMealDescription")}
            placeholderTextColor="#6B7280"
            multiline
            numberOfLines={3}
            value={formData.description || ""}
            onChangeText={(text) =>
              setFormData({ ...formData, description: text })
            }
          />
        </View>

        {/* Featured Toggle */}
        <View style={styles.formGroupRow}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.featured")}
          </Text>
          <Switch
            value={!!formData.isFeatured}
            onValueChange={(v) => setFormData({ ...formData, isFeatured: v })}
            trackColor={{ true: "#ec4899", false: "#374151" }}
            thumbColor="#fff"
          />
        </View>

        {/* Drink Toggle */}
        <View style={styles.formGroupRow}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.isDrink", { defaultValue: "Drink" })}
          </Text>
          <Switch
            value={!!(formData as any).isDrink}
            onValueChange={(v) => setFormData({ ...formData, isDrink: v } as any)}
            trackColor={{ true: "#ec4899", false: "#374151" }}
            thumbColor="#fff"
          />
        </View>

        {/* Category */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.category")}{" "}
            <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={styles.categoryDropdown}
            onPress={() => setShowCategoryModal(true)}
          >
            <MaterialCommunityIcons name="package-variant" size={16} color="#9CA3AF" />
            <Text
              style={[
                styles.categoryDropdownText,
                !formData.categoryId && styles.categoryDropdownPlaceholder,
              ]}
            >
              {formData.categoryId
                ? categories.find((c) => c.id === formData.categoryId)?.name
                : t("admin.menuManagement.selectCategory")}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Meal Image */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.mealImage")}
          </Text>
          {formData.image ? (
            <View style={styles.imagePreview}>
              <Image
                source={{ uri: getOptimizedImageUrl(formData.image) }}
                style={styles.imagePreviewImage}
                resizeMode="cover"
              />
              <View style={styles.imagePreviewActions}>
                <TouchableOpacity
                  style={styles.changeImageButton}
                  onPress={() => setShowImagePickerModal(true)}
                  disabled={isUploadingImage}
                >
                  <EditIcon size={14} color="#fff" />
                  <Text style={styles.changeImageButtonText}>
                    {t("admin.menuManagement.change")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setFormData({ ...formData, image: undefined })}
                  disabled={isUploadingImage}
                >
                  <MaterialCommunityIcons name="delete" size={14} color="#fff" />
                  <Text style={styles.removeImageButtonText}>
                    {t("admin.menuManagement.remove")}
                  </Text>
                </TouchableOpacity>
              </View>
              {isUploadingImage && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color="#ec4899" />
                  <Text style={styles.uploadingText}>
                    {t("admin.menuManagement.processingImage")}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.imagePickerContainer}>
              <TouchableOpacity
                style={styles.imagePickerButton}
                onPress={() => setShowImagePickerModal(true)}
                disabled={isUploadingImage}
              >
                {isUploadingImage ? (
                  <ActivityIndicator size="small" color="#ec4899" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="camera" size={24} color="#ec4899" />
                    <Text style={styles.imagePickerButtonText}>
                      {t("admin.menuManagement.addMealImage")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.imagePickerHint}>
                {t("admin.menuManagement.chooseFromLibraryOrPhoto")}
              </Text>
            </View>
          )}
        </View>

        {/* Meal Sizes */}
        <View style={styles.formGroup}>
          <View style={styles.formGroupHeader}>
            <Text style={styles.formLabel}>
              {t("admin.menuManagement.mealSizes")}
            </Text>
            <TouchableOpacity
              style={styles.addSizeButton}
              onPress={openAddSizeModal}
            >
              <MaterialCommunityIcons name="plus" size={14} color="#ec4899" />
              <Text style={styles.addSizeButtonText}>
                {t("admin.menuManagement.addSize")}
              </Text>
            </TouchableOpacity>
          </View>
          {formData.sizes?.map((size, index) => (
            <View key={index} style={styles.sizeItemContainer}>
              <View style={styles.sizeItemHeader}>
                <Text style={styles.sizeItemLabel}>Size {index + 1}</Text>
                <TouchableOpacity
                  style={styles.removeSizeButton}
                  onPress={() => removeSize(index)}
                >
                  <MaterialCommunityIcons name="delete" size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.sizeInput}
                placeholder={t("admin.menuManagement.sizeNamePlaceholder")}
                placeholderTextColor="#6B7280"
                value={size.name}
                onChangeText={(text) => updateSize(index, "name", text)}
              />
              <View style={styles.sizeTypeContainer}>
                {(["S", "M", "L", "XL"] as const).map((sizeType) => (
                  <TouchableOpacity
                    key={sizeType}
                    style={[
                      styles.sizeTypeButton,
                      size.sizeType === sizeType &&
                        styles.sizeTypeButtonActive,
                    ]}
                    onPress={() => updateSize(index, "sizeType", sizeType)}
                  >
                    <Text
                      style={[
                        styles.sizeTypeButtonText,
                        size.sizeType === sizeType &&
                          styles.sizeTypeButtonTextActive,
                      ]}
                    >
                      {sizeType}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.sizeInput}
                placeholder={t("admin.menuManagement.pricePlaceholder")}
                placeholderTextColor="#6B7280"
                keyboardType="decimal-pad"
                value={
                  sizePriceTexts[index] !== undefined
                    ? sizePriceTexts[index]
                    : size.price?.toString() || ""
                }
                onChangeText={(text) => {
                  // Only allow numbers and decimal point
                  let cleaned = text.replace(/[^0-9.]/g, "");
                  // Only allow one decimal point
                  const parts = cleaned.split(".");
                  if (parts.length > 2) {
                    cleaned = parts[0] + "." + parts.slice(1).join("");
                  }
                  // Update text display
                  setSizePriceTexts({ ...sizePriceTexts, [index]: cleaned });
                  // Update form data only if it's a valid number
                  if (cleaned === "" || cleaned === ".") {
                    updateSize(index, "price", 0);
                  } else {
                    const numValue = parseFloat(cleaned);
                    if (!isNaN(numValue)) {
                      updateSize(index, "price", numValue);
                    }
                  }
                }}
              />
              <TextInput
                style={styles.sizeInput}
                placeholder={t("admin.menuManagement.taxPercentPlaceholder")}
                placeholderTextColor="#6B7280"
                keyboardType="decimal-pad"
                value={size.taxPercentage?.toString() || ""}
                onChangeText={(text) => {
                  // Only allow numbers and decimal point
                  const cleaned = text.replace(/[^0-9.]/g, "");
                  // Only allow one decimal point
                  const parts = cleaned.split(".");
                  const formatted =
                    parts.length > 2
                      ? parts[0] + "." + parts.slice(1).join("")
                      : cleaned;
                  updateSize(
                    index,
                    "taxPercentage",
                    formatted ? parseFloat(formatted) : null
                  );
                }}
              />
            </View>
          ))}
        </View>

        {/* Addons */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.availableAddons")}
          </Text>
          <TouchableOpacity
            style={styles.addonsButton}
            onPress={() => setShowAddonsModal(true)}
          >
            <View style={styles.addonsButtonContent}>
              <View style={styles.addonsButtonLeft}>
                <MaterialCommunityIcons name="plus-circle" size={20} color="#ec4899" />
                <Text style={styles.addonsButtonText}>
                  {formData.addOnIds && formData.addOnIds.length > 0
                    ? t("admin.menuManagement.addonsSelected", {
                        count: formData.addOnIds.length,
                      })
                    : t("admin.menuManagement.addAddons")}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={16} color="#9CA3AF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Declarations */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.declarations")}
          </Text>
          <TouchableOpacity
            style={styles.addonsButton}
            onPress={() => setShowDeclarationsModal(true)}
          >
            <View style={styles.addonsButtonContent}>
              <View style={styles.addonsButtonLeft}>
                <MaterialCommunityIcons name="tag" size={20} color="#ec4899" />
                <Text style={styles.addonsButtonText}>
                  {formData.declarationIds && formData.declarationIds.length > 0
                    ? t("admin.menuManagement.declarationsSelected", {
                        count: formData.declarationIds.length,
                      })
                    : t("admin.menuManagement.addDeclarations")}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={16} color="#9CA3AF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Optional Ingredients */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.availableOptionalIngredients")}
          </Text>
          <TouchableOpacity
            style={styles.addonsButton}
            onPress={() => setShowOptionalIngredientsModal(true)}
          >
            <View style={styles.addonsButtonContent}>
              <View style={styles.addonsButtonLeft}>
                <MaterialCommunityIcons name="check-circle" size={20} color="#ec4899" />
                <Text style={styles.addonsButtonText}>
                  {formData.optionalIngredientIds && formData.optionalIngredientIds.length > 0
                    ? t("admin.menuManagement.optionalIngredientsSelected", {
                        count: formData.optionalIngredientIds.length,
                      })
                    : t("admin.menuManagement.addOptionalIngredients")}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={16} color="#9CA3AF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Excluded Branches Section */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>
            {t("admin.menuManagement.excludedBranches")}
          </Text>
          <Text style={styles.inputHint}>
            {t("admin.menuManagement.excludedBranchesDescription")}
          </Text>
          {loadingBranches ? (
            <View style={styles.branchesLoadingContainer}>
              <ActivityIndicator size="small" color="#ec4899" />
              <Text style={styles.branchesLoadingText}>
                {t("admin.menuManagement.loadingBranches")}
              </Text>
            </View>
          ) : branches.length === 0 ? (
            <View style={styles.branchesEmptyContainer}>
              <Text style={styles.branchesEmptyText}>
                {t("admin.menuManagement.noBranchesAvailable")}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.branchPriceFormSelect}
              onPress={() => {
                setBranchPickerMode("excludedBranches");
                setBranchPickerAvailable(branches);
                setTempExcludedBranches(formData.excludedBranches || []);
                setBranchPickerVisible(true);
              }}
            >
              <Text
                style={[
                  styles.branchPriceFormSelectText,
                  (!formData.excludedBranches || formData.excludedBranches.length === 0) &&
                    styles.branchPriceFormSelectPlaceholder,
                ]}
              >
                {formData.excludedBranches && formData.excludedBranches.length > 0
                  ? t("admin.menuManagement.branchesExcluded", {
                      count: formData.excludedBranches.length,
                    })
                  : t("admin.menuManagement.selectBranches", {
                      defaultValue: "Select branches",
                    })}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
          {formData.excludedBranches && formData.excludedBranches.length > 0 && (
            <View style={styles.excludedBranchesSummary}>
              <Text style={styles.excludedBranchesSummaryText}>
                {t("admin.menuManagement.branchesExcluded", {
                  count: formData.excludedBranches.length,
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Branch-Specific Prices Section - Only show when editing */}
        {isEditing && formData.id && (
          <View style={styles.formGroup}>
            <View style={styles.branchPriceFormGroupHeader}>
              <View style={styles.formGroupHeaderText}>
                <Text style={styles.formLabel}>
                  {t("admin.menuManagement.branchSpecificPrices")}
                </Text>
                <Text style={styles.inputHint}>
                  {t("admin.menuManagement.branchSpecificPricesDescription")}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.addBranchPriceButton}
                onPress={() => {
                  setEditingBranchPrice({
                    branchId: "",
                    basePrice: formData.basePrice?.toString() || "0",
                    taxPercentage: formData.taxPercentage?.toString() || "",
                  });
                }}
                disabled={isSubmitting}
              >
                <MaterialCommunityIcons name="plus" size={14} color="#ec4899" />
                <Text style={styles.addBranchPriceButtonText}>
                  {t("admin.menuManagement.addBranchPrice")}
                </Text>
              </TouchableOpacity>
            </View>

            {loadingBranchPrices ? (
              <View style={styles.branchesLoadingContainer}>
                <ActivityIndicator size="small" color="#ec4899" />
                <Text style={styles.branchesLoadingText}>
                  {t("admin.menuManagement.loadingBranchPrices")}
                </Text>
              </View>
            ) : branchPrices.length === 0 ? (
              <View style={styles.branchesEmptyContainer}>
                <Text style={styles.branchesEmptyText}>
                  {t("admin.menuManagement.noBranchPricesSet")}
                </Text>
              </View>
            ) : (
              <View style={styles.branchPricesList}>
                {branchPrices.map((bp) => (
                  <View key={bp.id} style={styles.branchPriceItem}>
                    <View style={styles.branchPriceItemContent}>
                      <Text style={styles.branchPriceItemName}>
                        {bp.branch.name}
                      </Text>
                      <View style={styles.branchPriceItemDetails}>
                        <Text style={styles.branchPriceItemDetail}>
                          {t("admin.menuManagement.price")}: ${parseFloat(bp.basePrice).toFixed(2)}
                        </Text>
                        {bp.taxPercentage !== null && (
                          <Text style={styles.branchPriceItemDetail}>
                            {t("admin.menuManagement.tax")}: {bp.taxPercentage}%
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.branchPriceItemActions}>
                      <TouchableOpacity
                        style={styles.branchPriceEditButton}
                        onPress={() => {
                          setEditingBranchPrice({
                            branchId: bp.branchId,
                            basePrice: bp.basePrice,
                            taxPercentage: bp.taxPercentage?.toString() || "",
                          });
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.branchPriceIconContainer}>
                          <EditIcon size={18} color="#ec4899" withContainer={false} />
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.branchPriceDeleteButton}
                        onPress={() => {
                          setBranchPriceToDelete({
                            branchId: bp.branchId,
                            branchName: bp.branch.name,
                          });
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.branchPriceIconContainer}>
                          <MaterialCommunityIcons name="delete" size={18} color="#ef4444" />
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Add/Edit Branch Price Form */}
            {editingBranchPrice && (
              <View style={styles.branchPriceForm}>
                <View style={styles.branchPriceFormHeader}>
                  <Text style={styles.branchPriceFormTitle}>
                    {branchPrices.find(bp => bp.branchId === editingBranchPrice.branchId)
                      ? t("admin.menuManagement.editBranchPrice")
                      : t("admin.menuManagement.addBranchPrice")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setEditingBranchPrice(null)}
                    style={styles.branchPriceFormClose}
                  >
                    <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                <View style={styles.branchPriceFormField}>
                  <Text style={styles.branchPriceFormLabel}>
                    {t("admin.menuManagement.branch")}
                  </Text>
                  <TouchableOpacity
                    style={styles.branchPriceFormSelect}
                    onPress={() => {
                      const availableBranches = branches.filter(
                        (b) =>
                          !branchPrices.find(
                            (bp) =>
                              bp.branchId === b.id &&
                              bp.branchId !== editingBranchPrice.branchId
                          )
                      );
                      if (availableBranches.length > 0) {
                        setBranchPickerMode("branchPrice");
                        setBranchPickerAvailable(availableBranches);
                        setBranchPickerVisible(true);
                      }
                    }}
                  >
                    <Text style={[
                      styles.branchPriceFormSelectText,
                      !editingBranchPrice.branchId && styles.branchPriceFormSelectPlaceholder
                    ]}>
                      {editingBranchPrice.branchId
                        ? branches.find(b => b.id === editingBranchPrice.branchId)?.name || t("admin.menuManagement.selectBranch")
                        : t("admin.menuManagement.selectBranch")}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                <View style={styles.branchPriceFormField}>
                  <Text style={styles.branchPriceFormLabel}>
                    {t("admin.menuManagement.basePrice")}
                  </Text>
                  <TextInput
                    style={styles.branchPriceFormInput}
                    placeholder="0.00"
                    placeholderTextColor="#6B7280"
                    keyboardType="decimal-pad"
                    value={editingBranchPrice.basePrice}
                    onChangeText={(text) => {
                      let cleaned = text.replace(/[^0-9.]/g, "");
                      const parts = cleaned.split(".");
                      if (parts.length > 2)
                        cleaned = parts[0] + "." + parts.slice(1).join("");
                      setEditingBranchPrice({
                        ...editingBranchPrice,
                        basePrice: cleaned,
                      });
                    }}
                  />
                </View>

                <View style={styles.branchPriceFormField}>
                  <Text style={styles.branchPriceFormLabel}>
                    {t("admin.menuManagement.taxPercentage")} ({t("admin.menuManagement.optional")})
                  </Text>
                  <TextInput
                    style={styles.branchPriceFormInput}
                    placeholder="8.5"
                    placeholderTextColor="#6B7280"
                    keyboardType="decimal-pad"
                    value={editingBranchPrice.taxPercentage}
                    onChangeText={(text) => {
                      let cleaned = text.replace(/[^0-9.]/g, "");
                      const parts = cleaned.split(".");
                      if (parts.length > 2)
                        cleaned = parts[0] + "." + parts.slice(1).join("");
                      setEditingBranchPrice({
                        ...editingBranchPrice,
                        taxPercentage: cleaned,
                      });
                    }}
                  />
                </View>

                <View style={styles.branchPriceFormActions}>
                  <TouchableOpacity
                    style={styles.branchPriceFormCancelButton}
                    onPress={() => setEditingBranchPrice(null)}
                  >
                    <Text style={styles.branchPriceFormCancelButtonText}>
                      {t("common.cancel")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.branchPriceFormSaveButton,
                      (!editingBranchPrice.branchId || !editingBranchPrice.basePrice) && styles.branchPriceFormSaveButtonDisabled,
                    ]}
                    onPress={handleSaveBranchPrice}
                    disabled={!editingBranchPrice.branchId || !editingBranchPrice.basePrice || isSubmitting}
                  >
                    <Text style={styles.branchPriceFormSaveButtonText}>
                      {t("admin.menuManagement.save")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Footer Actions */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={isSubmitting}
        >
          <Text style={styles.cancelButtonText}>
            {t("admin.menuManagement.cancel")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="check-circle" size={16} color="#fff" />
              <Text style={styles.submitButtonText}>
                {isEditing
                  ? t("admin.menuManagement.update")
                  : t("admin.menuManagement.create")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={branchPickerVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setBranchPickerVisible(false)}
      >
        <Pressable
          style={styles.branchSheetOverlay}
          onPress={() => setBranchPickerVisible(false)}
        >
          <Pressable
            style={[styles.branchSheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.branchSheetHandle} />
            <View style={styles.branchSheetHeader}>
              <Text style={styles.branchSheetTitle}>
                {branchPickerMode === "branchPrice"
                  ? t("admin.menuManagement.selectBranch")
                  : t("admin.menuManagement.selectBranches", {
                      defaultValue: "Select branches",
                    })}
              </Text>
              <TouchableOpacity onPress={() => setBranchPickerVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.branchSheetBody}>
              {branchPickerAvailable.map((b) => {
                const isSelected =
                  branchPickerMode === "branchPrice"
                    ? editingBranchPrice?.branchId === b.id
                    : tempExcludedBranches.includes(b.id);
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.branchSheetItem}
                    onPress={() => {
                      if (branchPickerMode === "branchPrice") {
                        if (editingBranchPrice) {
                          setEditingBranchPrice({
                            ...editingBranchPrice,
                            branchId: b.id,
                          });
                        }
                        setBranchPickerVisible(false);
                        return;
                      }

                      setTempExcludedBranches((prev) =>
                        prev.includes(b.id)
                          ? prev.filter((id) => id !== b.id)
                          : [...prev, b.id]
                      );
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.branchSheetItemLeft}>
                      {branchPickerMode === "excludedBranches" && (
                        <View
                          style={[
                            styles.branchSheetCheckbox,
                            isSelected && styles.branchSheetCheckboxSelected,
                          ]}
                        >
                          {isSelected && (
                            <MaterialCommunityIcons name="check" size={14} color="#fff" />
                          )}
                        </View>
                      )}
                      <Text style={styles.branchSheetItemText}>{b.name}</Text>
                    </View>

                    {branchPickerMode === "branchPrice" && isSelected && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color="#ec4899"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {branchPickerMode === "excludedBranches" && (
              <View style={styles.branchSheetFooter}>
                <TouchableOpacity
                  style={styles.branchSheetCancel}
                  onPress={() => setBranchPickerVisible(false)}
                >
                  <Text style={styles.branchSheetCancelText}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.branchSheetApply}
                  onPress={() => {
                    setFormData({
                      ...formData,
                      excludedBranches: tempExcludedBranches,
                    });
                    setBranchPickerVisible(false);
                  }}
                >
                  <Text style={styles.branchSheetApplyText}>
                    {t("admin.menuManagement.save")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add Size Modal */}
      <Modal
        visible={showAddSizeModal}
        transparent
        animationType="slide"
        onRequestClose={closeAddSizeModal}
      >
        <Pressable
          style={styles.addSizeModalContainer}
          onPress={closeAddSizeModal}
        >
          <Pressable
            style={[
              styles.addSizeModalContent,
              { marginBottom: keyboardHeight > 0 ? keyboardHeight : 0 },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.addSizeModalHeader}>
              <Text style={styles.addSizeModalTitle}>
                {t("admin.menuManagement.newSize")}
              </Text>
              <TouchableOpacity onPress={closeAddSizeModal}>
                <Text style={styles.addSizeModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.addSizeModalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.addSizeFormGroup}>
                <Text style={styles.addSizeFormLabel}>
                  {t("admin.menuManagement.sizeName")}{" "}
                  <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.addSizeInput}
                  placeholder={t("admin.menuManagement.sizeNamePlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={newSize.name}
                  onChangeText={(text) =>
                    setNewSize({ ...newSize, name: text })
                  }
                />
              </View>

              <View style={styles.addSizeFormGroup}>
                <Text style={styles.addSizeFormLabel}>
                  {t("admin.menuManagement.sizeType")}{" "}
                  <Text style={styles.required}>*</Text>
                </Text>
                <View style={styles.sizeTypeContainer}>
                  {(["S", "M", "L", "XL"] as const).map((sizeType) => (
                    <TouchableOpacity
                      key={sizeType}
                      style={[
                        styles.sizeTypeButton,
                        newSize.sizeType === sizeType &&
                          styles.sizeTypeButtonActive,
                      ]}
                      onPress={() =>
                        setNewSize({ ...newSize, sizeType })
                      }
                    >
                      <Text
                        style={[
                          styles.sizeTypeButtonText,
                          newSize.sizeType === sizeType &&
                            styles.sizeTypeButtonTextActive,
                        ]}
                      >
                        {sizeType}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.addSizeFormGroup}>
                <Text style={styles.addSizeFormLabel}>
                  {t("admin.menuManagement.price")}{" "}
                  <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.addSizeInput}
                  placeholder={t("admin.menuManagement.pricePlaceholder")}
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
                  value={newSizePriceText}
                  onChangeText={(text) => {
                    // Only allow numbers and decimal point
                    let cleaned = text.replace(/[^0-9.]/g, "");
                    // Only allow one decimal point
                    const parts = cleaned.split(".");
                    if (parts.length > 2) {
                      cleaned = parts[0] + "." + parts.slice(1).join("");
                    }
                    // Update text display
                    setNewSizePriceText(cleaned);
                    // Update form data only if it's a valid number
                    if (cleaned === "" || cleaned === ".") {
                      setNewSize({ ...newSize, price: null });
                    } else {
                      const numValue = parseFloat(cleaned);
                      if (!isNaN(numValue)) {
                        setNewSize({ ...newSize, price: numValue });
                      }
                    }
                  }}
                />
              </View>

              <View style={styles.addSizeFormGroup}>
                <Text style={styles.addSizeFormLabel}>
                  {t("admin.menuManagement.taxPercentageOptional")}
                </Text>
                <TextInput
                  style={styles.addSizeInput}
                  placeholder={t(
                    "admin.menuManagement.taxPercentagePlaceholder"
                  )}
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
                  value={newSizeTaxText}
                  onChangeText={(text) => {
                    // Only allow numbers and decimal point
                    let cleaned = text.replace(/[^0-9.]/g, "");
                    // Only allow one decimal point
                    const parts = cleaned.split(".");
                    if (parts.length > 2) {
                      cleaned = parts[0] + "." + parts.slice(1).join("");
                    }
                    // Update text display
                    setNewSizeTaxText(cleaned);
                    // Update form data only if it's a valid number
                    if (cleaned === "" || cleaned === ".") {
                      setNewSize({ ...newSize, taxPercentage: null });
                    } else {
                      const numValue = parseFloat(cleaned);
                      if (!isNaN(numValue)) {
                        setNewSize({ ...newSize, taxPercentage: numValue });
                      }
                    }
                  }}
                />
                <Text style={styles.inputHint}>
                  {t("admin.menuManagement.overrideTaxForSize")}
                </Text>
              </View>
            </ScrollView>

            <View style={styles.addSizeModalFooter}>
              <TouchableOpacity
                style={styles.addSizeCancelButton}
                onPress={closeAddSizeModal}
              >
                <Text style={styles.addSizeCancelButtonText}>
                  {t("admin.menuManagement.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addSizeSaveButton}
                onPress={handleAddSize}
              >
                <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                <Text style={styles.addSizeSaveButtonText}>
                  {t("admin.menuManagement.addSize")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Image Picker Modal */}
      <Modal
        visible={showImagePickerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowImagePickerModal(false)}
      >
        <Pressable
          style={styles.imagePickerModalContainer}
          onPress={() => setShowImagePickerModal(false)}
        >
          <Pressable
            style={styles.imagePickerModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.imagePickerModalHeader}>
              <Text style={styles.imagePickerModalTitle}>
                {t("admin.menuManagement.selectImage")}
              </Text>
              <TouchableOpacity onPress={() => setShowImagePickerModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.imagePickerOptions}>
              <TouchableOpacity
                style={styles.imagePickerOption}
                onPress={() => handlePickImage("library")}
              >
                <View style={styles.imagePickerOptionIcon}>
                  <MaterialCommunityIcons name="image" size={32} color="#ec4899" />
                </View>
                <View style={styles.imagePickerOptionText}>
                  <Text style={styles.imagePickerOptionTitle}>
                    {t("admin.menuManagement.chooseFromLibrary")}
                  </Text>
                  <Text style={styles.imagePickerOptionSubtitle}>
                    {t("admin.menuManagement.selectExistingPhoto")}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.imagePickerOption}
                onPress={() => handlePickImage("camera")}
              >
                <View style={styles.imagePickerOptionIcon}>
                  <MaterialCommunityIcons name="camera" size={32} color="#ec4899" />
                </View>
                <View style={styles.imagePickerOptionText}>
                  <Text style={styles.imagePickerOptionTitle}>
                    {t("admin.menuManagement.takePhoto")}
                  </Text>
                  <Text style={styles.imagePickerOptionSubtitle}>
                    {t("admin.menuManagement.captureNewPhoto")}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Category Selection Modal */}
      <Modal
        visible={showCategoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowCategoryModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.menuManagement.selectCategory")}
              </Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.bottomSheetOption,
                    formData.categoryId === category.id &&
                      styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    setFormData({ ...formData, categoryId: category.id });
                    setAddonFilterType("all"); // Reset filter when category changes
                    setShowCategoryModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      formData.categoryId === category.id &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                  {formData.categoryId === category.id && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color="#ec4899"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Addons Selection Modal */}
      <Modal
        visible={showAddonsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddonsModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAddonsModal(false)}
        >
          <Pressable
            style={styles.addonsModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.addonsModalHeader}>
              <Text style={styles.addonsModalTitle}>
                {t("admin.menuManagement.availableAddons")}
              </Text>
              <TouchableOpacity onPress={() => setShowAddonsModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Select All Category Addons Button */}
            {formData.categoryId && (
              <View style={styles.selectAllCategoryContainer}>
                <TouchableOpacity
                  style={styles.selectAllCategoryButton}
                  onPress={selectAllCategoryAddons}
                >
                  <MaterialCommunityIcons name="check-circle" size={16} color="#ec4899" />
                  <Text style={styles.selectAllCategoryButtonText}>
                    {t("admin.menuManagement.selectAllCategoryAddons")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Filter Buttons */}
            <View style={styles.addonsFilterContainer}>
              <TouchableOpacity
                style={[
                  styles.addonsFilterButton,
                  addonFilterType === "all" && styles.addonsFilterButtonActive,
                ]}
                onPress={() => setAddonFilterType("all")}
              >
                <Text
                  style={[
                    styles.addonsFilterButtonText,
                    addonFilterType === "all" &&
                      styles.addonsFilterButtonTextActive,
                  ]}
                >
                  {t("admin.menuManagement.allAddons")}
                </Text>
              </TouchableOpacity>
              {formData.categoryId && (() => {
                const selectedCategory = categories.find(
                  (cat) => cat.id === formData.categoryId
                );
                return selectedCategory ? (
                  <TouchableOpacity
                    style={[
                      styles.addonsFilterButton,
                      addonFilterType === "category" &&
                        styles.addonsFilterButtonActive,
                    ]}
                    onPress={() => setAddonFilterType("category")}
                  >
                    <Text
                      style={[
                        styles.addonsFilterButtonText,
                        addonFilterType === "category" &&
                          styles.addonsFilterButtonTextActive,
                      ]}
                    >
                      {t("admin.menuManagement.showCategoryAddons", {
                        categoryName: selectedCategory.name,
                      })}
                    </Text>
                  </TouchableOpacity>
                ) : null;
              })()}
              <TouchableOpacity
                style={[
                  styles.addonsFilterButton,
                  addonFilterType === "available" &&
                    styles.addonsFilterButtonActive,
                ]}
                onPress={() => setAddonFilterType("available")}
              >
                <Text
                  style={[
                    styles.addonsFilterButtonText,
                    addonFilterType === "available" &&
                      styles.addonsFilterButtonTextActive,
                  ]}
                >
                  {t("admin.menuManagement.selectedAddons")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <TextInput
              style={styles.addonsSearchInput}
              placeholder={t("admin.menuManagement.searchAddons")}
              placeholderTextColor="#6B7280"
              value={addonSearchTerm}
              onChangeText={setAddonSearchTerm}
            />

            {/* Addons List */}
            <ScrollView
              style={styles.addonsModalList}
              showsVerticalScrollIndicator={false}
            >
              {filteredAddons.map((addon) => {
                const isSelected = formData.addOnIds?.includes(addon.id);
                return (
                  <TouchableOpacity
                    key={addon.id}
                    style={[
                      styles.addonModalItem,
                      isSelected && styles.addonModalItemSelected,
                    ]}
                    onPress={() => toggleAddon(addon.id)}
                  >
                    {addon.image && (
                      <Image
                        source={{ uri: getOptimizedImageUrl(addon.image) }}
                        style={styles.addonModalImage}
                        resizeMode="cover"
                      />
                    )}
                    <View style={styles.addonModalInfo}>
                      <Text style={styles.addonModalName}>{addon.name}</Text>
                      <Text style={styles.addonModalMeta}>
                        ${parsePrice(addon.price || "0").toFixed(2)} • {addon.type}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.addonModalCheckbox,
                        isSelected && styles.addonModalCheckboxChecked,
                      ]}
                    >
                      {isSelected && (
                        <View style={styles.addonModalCheckboxInner} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {filteredAddons.length === 0 && (
                <Text style={styles.emptyAddonsText}>
                  {addonSearchTerm
                    ? t("admin.menuManagement.noAddonsMatch")
                    : t("admin.menuManagement.noAddonsAvailable")}
                </Text>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.addonsModalFooter}>
              <Text style={styles.addonsModalFooterText}>
                {t("admin.menuManagement.addonsSelected", {
                  count: formData.addOnIds?.length || 0,
                })}
              </Text>
              <TouchableOpacity
                style={styles.addonsModalDoneButton}
                onPress={() => setShowAddonsModal(false)}
              >
                <Text style={styles.addonsModalDoneButtonText}>
                  {t("admin.menuManagement.done")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Declarations Selection Modal */}
      <Modal
        visible={showDeclarationsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeclarationsModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDeclarationsModal(false)}
        >
          <Pressable
            style={styles.addonsModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.addonsModalHeader}>
              <Text style={styles.addonsModalTitle}>
                {t("admin.menuManagement.declarations")}
              </Text>
              <TouchableOpacity onPress={() => setShowDeclarationsModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Filter Buttons */}
            <View style={styles.addonsFilterContainer}>
              <TouchableOpacity
                style={[
                  styles.addonsFilterButton,
                  declarationFilterType === "all" && styles.addonsFilterButtonActive,
                ]}
                onPress={() => setDeclarationFilterType("all")}
              >
                <Text
                  style={[
                    styles.addonsFilterButtonText,
                    declarationFilterType === "all" &&
                      styles.addonsFilterButtonTextActive,
                  ]}
                >
                  {t("admin.menuManagement.allDeclarations")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.addonsFilterButton,
                  declarationFilterType === "available" &&
                    styles.addonsFilterButtonActive,
                ]}
                onPress={() => setDeclarationFilterType("available")}
              >
                <Text
                  style={[
                    styles.addonsFilterButtonText,
                    declarationFilterType === "available" &&
                      styles.addonsFilterButtonTextActive,
                  ]}
                >
                  {t("admin.menuManagement.selectedDeclarations")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <TextInput
              style={styles.addonsSearchInput}
              placeholder={t("admin.menuManagement.searchDeclarations")}
              placeholderTextColor="#6B7280"
              value={declarationSearchTerm}
              onChangeText={setDeclarationSearchTerm}
            />

            {/* Declarations List */}
            <ScrollView
              style={styles.addonsModalList}
              showsVerticalScrollIndicator={false}
            >
              {filteredDeclarations.map((declaration) => {
                const isSelected = formData.declarationIds?.includes(
                  declaration.id
                );
                return (
                  <TouchableOpacity
                    key={declaration.id}
                    style={[
                      styles.addonModalItem,
                      isSelected && styles.addonModalItemSelected,
                    ]}
                    onPress={() => toggleDeclaration(declaration.id)}
                  >
                    <View style={styles.declarationIconContainer}>
                      {declaration.icon ? (
                        <Text style={styles.declarationIcon}>
                          {declaration.icon}
                        </Text>
                      ) : (
                        <MaterialCommunityIcons name="tag" size={20} color="#6B7280" />
                      )}
                    </View>
                    <View style={styles.addonModalInfo}>
                      <Text style={styles.addonModalName}>{declaration.name}</Text>
                      {declaration.type && (
                        <Text style={styles.addonModalMeta}>{declaration.type}</Text>
                      )}
                    </View>
                    <View
                      style={[
                        styles.addonModalCheckbox,
                        isSelected && styles.addonModalCheckboxChecked,
                      ]}
                    >
                      {isSelected && (
                        <View style={styles.addonModalCheckboxInner} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {filteredDeclarations.length === 0 && (
                <Text style={styles.emptyAddonsText}>
                  {declarationSearchTerm
                    ? t("admin.menuManagement.noDeclarationsMatch")
                    : t("admin.menuManagement.noDeclarationsAvailable")}
                </Text>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.addonsModalFooter}>
              <Text style={styles.addonsModalFooterText}>
                {t("admin.menuManagement.declarationsSelected", {
                  count: formData.declarationIds?.length || 0,
                })}
              </Text>
              <TouchableOpacity
                style={styles.addonsModalDoneButton}
                onPress={() => setShowDeclarationsModal(false)}
              >
                <Text style={styles.addonsModalDoneButtonText}>
                  {t("admin.menuManagement.done")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Optional Ingredients Selection Modal */}
      <Modal
        visible={showOptionalIngredientsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOptionalIngredientsModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowOptionalIngredientsModal(false)}
        >
          <Pressable
            style={styles.addonsModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.addonsModalHeader}>
              <Text style={styles.addonsModalTitle}>
                {t("admin.menuManagement.availableOptionalIngredients")}
              </Text>
              <TouchableOpacity onPress={() => setShowOptionalIngredientsModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Filter Buttons */}
            <View style={styles.addonsFilterContainer}>
              <TouchableOpacity
                style={[
                  styles.addonsFilterButton,
                  optionalIngredientFilterType === "all" && styles.addonsFilterButtonActive,
                ]}
                onPress={() => setOptionalIngredientFilterType("all")}
              >
                <Text
                  style={[
                    styles.addonsFilterButtonText,
                    optionalIngredientFilterType === "all" &&
                      styles.addonsFilterButtonTextActive,
                  ]}
                >
                  {t("admin.menuManagement.allOptionalIngredients")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.addonsFilterButton,
                  optionalIngredientFilterType === "available" &&
                    styles.addonsFilterButtonActive,
                ]}
                onPress={() => setOptionalIngredientFilterType("available")}
              >
                <Text
                  style={[
                    styles.addonsFilterButtonText,
                    optionalIngredientFilterType === "available" &&
                      styles.addonsFilterButtonTextActive,
                  ]}
                >
                  {t("admin.menuManagement.selectedOptionalIngredients")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <TextInput
              style={styles.addonsSearchInput}
              placeholder={t("admin.menuManagement.searchOptionalIngredients")}
              placeholderTextColor="#6B7280"
              value={optionalIngredientSearchTerm}
              onChangeText={setOptionalIngredientSearchTerm}
            />

            {/* Optional Ingredients List */}
            <ScrollView
              style={styles.addonsModalList}
              showsVerticalScrollIndicator={false}
            >
              {filteredOptionalIngredients.map((ingredient) => {
                const isSelected = formData.optionalIngredientIds?.includes(
                  ingredient.id
                );
                return (
                  <TouchableOpacity
                    key={ingredient.id}
                    style={[
                      styles.addonModalItem,
                      isSelected && styles.addonModalItemSelected,
                    ]}
                    onPress={() => toggleOptionalIngredient(ingredient.id)}
                  >
                    <View style={styles.addonModalInfo}>
                      <Text style={styles.addonModalName}>{ingredient.name}</Text>
                      {ingredient.description && (
                        <Text style={styles.addonModalMeta}>
                          {ingredient.description}
                        </Text>
                      )}
                    </View>
                    <View
                      style={[
                        styles.addonModalCheckbox,
                        isSelected && styles.addonModalCheckboxChecked,
                      ]}
                    >
                      {isSelected && (
                        <View style={styles.addonModalCheckboxInner} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {filteredOptionalIngredients.length === 0 && (
                <Text style={styles.emptyAddonsText}>
                  {optionalIngredientSearchTerm
                    ? t("admin.menuManagement.noOptionalIngredientsMatch")
                    : t("admin.menuManagement.noOptionalIngredientsAvailable")}
                </Text>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.addonsModalFooter}>
              <Text style={styles.addonsModalFooterText}>
                {t("admin.menuManagement.optionalIngredientsSelected", {
                  count: formData.optionalIngredientIds?.length || 0,
                })}
              </Text>
              <TouchableOpacity
                style={styles.addonsModalDoneButton}
                onPress={() => setShowOptionalIngredientsModal(false)}
              >
                <Text style={styles.addonsModalDoneButtonText}>
                  {t("admin.menuManagement.done")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toast */}
      {/* Delete Branch Price Confirmation Modal */}
      <Modal
        visible={!!branchPriceToDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setBranchPriceToDelete(null)}
      >
        <Pressable
          style={styles.deleteModalOverlay}
          onPress={() => setBranchPriceToDelete(null)}
        >
          <Pressable
            style={styles.deleteModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.deleteModalTitle}>
              {t("admin.menuManagement.deleteBranchPrice")}
            </Text>
            <Text style={styles.deleteModalText}>
              {t("admin.menuManagement.deleteBranchPriceConfirm", {
                branchName: branchPriceToDelete?.branchName || "",
              })}
            </Text>
            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteModalCancelButton}
                onPress={() => setBranchPriceToDelete(null)}
              >
                <Text style={styles.deleteModalCancelButtonText}>
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteModalConfirmButton}
                onPress={handleDeleteBranchPrice}
                disabled={isSubmitting}
              >
                <Text style={styles.deleteModalConfirmButtonText}>
                  {t("common.delete")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </KeyboardAvoidingView>
  );
}

const modalPaddingBottom = Platform.select({ ios: 34, default: 20 });
const bottomSheetPaddingBottom = Platform.select({ ios: 34, default: 20 });
const categoryModalPaddingBottom = Platform.select({ ios: 34, default: 20 });
const sizeModalPaddingBottom = Platform.select({ ios: 34, default: 16 });

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0a0a0a",
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    paddingTop: 20,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ec4899",
    flex: 1,
    textAlign: "center",
  },
  headerRight: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  scrollView: {
    flex: 1,
  },
  formGroupRow: {
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  formGroup: {
    marginBottom: 24,
  },
  formGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  required: {
    color: "#ef4444",
  },
  input: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#404040",
    minHeight: 50,
  },
  categoryDropdown: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#404040",
    gap: 8,
    minHeight: 50,
  },
  categoryDropdownText: {
    flex: 1,
    fontSize: 15,
    color: "#fff",
  },
  categoryDropdownPlaceholder: {
    color: "#6B7280",
  },
  inputHint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  textArea: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#404040",
    minHeight: 100,
    textAlignVertical: "top",
  },
  imagePickerContainer: {
    marginTop: 12,
    alignItems: "center",
  },
  imagePickerButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 2,
    borderColor: "#ec4899",
    borderStyle: "dashed",
  },
  imagePickerButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ec4899",
  },
  imagePickerHint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 8,
    textAlign: "center",
  },
  imagePreview: {
    marginTop: 12,
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
  },
  imagePreviewImage: {
    width: "100%",
    height: "100%",
  },
  imagePreviewActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 8,
    padding: 12,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  changeImageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  changeImageButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  removeImageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#ef4444",
  },
  removeImageButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  uploadingText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  imagePickerModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  imagePickerModalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: categoryModalPaddingBottom,
  },
  imagePickerModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  imagePickerModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  imagePickerOptions: {
    gap: 16,
  },
  imagePickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
  },
  imagePickerOptionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePickerOptionText: {
    flex: 1,
  },
  imagePickerOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  imagePickerOptionSubtitle: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  addSizeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  addSizeButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ec4899",
  },
  sizeItemContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#171717",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    gap: 12,
  },
  sizeItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sizeItemLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  sizeInput: {
    width: "100%",
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#404040",
    minHeight: 50,
  },
  removeSizeButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#404040",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  checkboxLabel: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  addonsList: {
    maxHeight: 250,
    marginTop: 12,
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 8,
  },
  addonItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#171717",
  },
  addonItemSelected: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  addonImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  addonInfo: {
    flex: 1,
    gap: 2,
  },
  addonName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
  },
  addonMeta: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  addonCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#404040",
    justifyContent: "center",
    alignItems: "center",
  },
  addonCheckboxChecked: {
    borderColor: "#ec4899",
    backgroundColor: "#ec4899",
  },
  addonCheckboxInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  emptyAddonsText: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    padding: 12,
  },
  branchesLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 20,
  },
  branchesLoadingText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  branchesEmptyContainer: {
    padding: 20,
    alignItems: "center",
  },
  branchesEmptyText: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  branchesContainer: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#0f0f0f",
  },
  branchOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
  },
  branchOptionSelected: {
    backgroundColor: "#1a1a1a",
    borderColor: "#ec4899",
  },
  branchOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  branchCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#6B7280",
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  branchCheckboxSelected: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  branchOptionText: {
    fontSize: 14,
    color: "#D1D5DB",
    flex: 1,
  },
  branchOptionTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  excludedBranchesSummary: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  excludedBranchesSummaryText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  branchPriceFormGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  formGroupHeaderText: {
    flex: 1,
    marginRight: 12,
  },
  addBranchPriceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  addBranchPriceButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ec4899",
  },
  branchPricesList: {
    gap: 8,
    marginTop: 12,
  },
  branchPriceItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#171717",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  branchPriceItemContent: {
    flex: 1,
  },
  branchPriceItemName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  branchPriceItemDetails: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  branchPriceItemDetail: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  branchPriceItemActions: {
    flexDirection: "row",
    gap: 8,
  },
  branchPriceEditButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "rgba(236, 72, 153, 0.15)",
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  branchPriceDeleteButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  branchPriceIconContainer: {
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "none",
  },
  branchPriceForm: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  branchPriceFormHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  branchPriceFormTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  branchPriceFormClose: {
    padding: 4,
  },
  branchPriceFormField: {
    marginBottom: 16,
  },
  branchPriceFormLabel: {
    fontSize: 14,
    color: "#D1D5DB",
    marginBottom: 8,
    fontWeight: "500",
  },
  branchPriceFormSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#404040",
  },
  branchPriceFormSelectText: {
    fontSize: 14,
    color: "#fff",
    flex: 1,
  },
  branchPriceFormSelectPlaceholder: {
    color: "#6B7280",
  },
  branchPriceFormInput: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#404040",
  },
  branchPriceFormActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  branchPriceFormCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#262626",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#404040",
  },
  branchPriceFormCancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  branchPriceFormSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    alignItems: "center",
  },
  branchPriceFormSaveButtonDisabled: {
    opacity: 0.5,
  },
  branchPriceFormSaveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  deleteModalContent: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#262626",
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  deleteModalText: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 20,
    lineHeight: 20,
  },
  deleteModalActions: {
    flexDirection: "row",
    gap: 12,
  },
  deleteModalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#262626",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#404040",
  },
  deleteModalCancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  deleteModalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
  },
  deleteModalConfirmButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  selectedAddonsInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderRadius: 8,
  },
  selectedAddonsText: {
    fontSize: 12,
    color: "#ec4899",
    fontWeight: "500",
  },
  addonsButton: {
    backgroundColor: "#171717",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    marginTop: 8,
  },
  addonsButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  addonsButtonLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  addonsButtonText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  addonsModalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: modalPaddingBottom,
    maxHeight: "90%",
  },
  addonsModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  addonsModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  addonsFilterContainer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexWrap: "wrap",
  },
  addonsFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
  },
  addonsFilterButtonActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderColor: "#ec4899",
  },
  addonsFilterButtonText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  addonsFilterButtonTextActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
  addonsSearchInput: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#404040",
  },
  addonsModalList: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  addonModalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#262626",
  },
  addonModalItemSelected: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  addonModalImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  addonModalInfo: {
    flex: 1,
    gap: 2,
  },
  addonModalName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
  },
  addonModalMeta: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  addonModalCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#404040",
    justifyContent: "center",
    alignItems: "center",
  },
  addonModalCheckboxChecked: {
    borderColor: "#ec4899",
    backgroundColor: "#ec4899",
  },
  addonModalCheckboxInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  addonsModalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#262626",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  addonsModalFooterText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "500",
    flex: 1,
  },
  addonsModalDoneButton: {
    backgroundColor: "#ec4899",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  addonsModalDoneButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  declarationIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#262626",
  },
  declarationIcon: {
    fontSize: 24,
  },
  branchSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  branchSheetContainer: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: bottomSheetPaddingBottom,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
  },
  branchSheetHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#404040",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  branchSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  branchSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  branchSheetBody: {
    padding: 8,
    maxHeight: 420,
  },
  branchSheetItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  branchSheetItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 12,
  },
  branchSheetItemText: {
    fontSize: 15,
    color: "#D1D5DB",
    fontWeight: "500",
    flex: 1,
  },
  branchSheetCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#404040",
    backgroundColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  branchSheetCheckboxSelected: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  branchSheetFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  branchSheetCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#262626",
    alignItems: "center",
  },
  branchSheetCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  branchSheetApply: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#ec4899",
    alignItems: "center",
  },
  branchSheetApplyText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: bottomSheetPaddingBottom,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  bottomSheetBody: {
    padding: 8,
    maxHeight: 400,
  },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  bottomSheetOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  bottomSheetOptionText: {
    fontSize: 15,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
  addSizeModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  addSizeModalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: categoryModalPaddingBottom,
    maxHeight: "85%",
  },
  addSizeModalClose: {
    fontSize: 24,
    color: "#9BA1A6",
  },
  addSizeModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  addSizeModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  addSizeModalScroll: {
    maxHeight: 400,
    marginBottom: 10,
  },
  addSizeFormGroup: {
    marginBottom: 20,
  },
  addSizeFormLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  addSizeInput: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#404040",
    minHeight: 50,
  },
  addSizeModalFooter: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  addSizeCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#262626",
    alignItems: "center",
  },
  addSizeCancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  addSizeSaveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  addSizeSaveButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  sizeTypeContainer: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  sizeTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#404040",
    alignItems: "center",
    justifyContent: "center",
  },
  sizeTypeButtonActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderColor: "#ec4899",
  },
  sizeTypeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  sizeTypeButtonTextActive: {
    color: "#ec4899",
  },
  selectAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  selectAllButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ec4899",
  },
  selectAllCategoryContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  selectAllCategoryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  selectAllCategoryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: sizeModalPaddingBottom,
    backgroundColor: "#0a0a0a",
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#262626",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  submitButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
