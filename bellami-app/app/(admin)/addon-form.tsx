import React, { useEffect, useState, useRef } from "react";
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
  Alert,
  type AlertButton,
  Switch,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import {
  addonService,
  type Addon,
  type AddonFormData,
  type AddonBranchPrice,
} from "@/src/services/addonService";
import { categoryService, type Category } from "@/src/services/categoryService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import ApiService from "@/src/services/apiService";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getOptimizedImageUrl = (imagePath: string): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

export default function AddonFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;
  const { getToken } = useAuthRole();
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

  const [formData, setFormData] = useState<
    Omit<AddonFormData, "price" | "sizes"> & { 
      id?: string; 
      price: number | null;
      sizes: Array<{
        sizeType: "S" | "M" | "L" | "XL";
        price: number | null;
        taxPercentage: number | null;
      }>;
    }
  >({
    name: "",
    description: "",
    price: null,
    sizes: [],
    taxPercentage: null,
    type: "BOOLEAN",
    image: undefined,
    isActive: true,
    categoryIds: [],
    excludedBranches: [],
  });
  const [priceText, setPriceText] = useState("");
  const [taxText, setTaxText] = useState("");
  const [sizePriceInputs, setSizePriceInputs] = useState<Record<number, string>>({});
  const [sizeTaxInputs, setSizeTaxInputs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
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
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  useEffect(() => {
    (async () => {
      const cameraPermission =
        await ImagePicker.requestCameraPermissionsAsync();
      const mediaPermission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!cameraPermission.granted || !mediaPermission.granted) {
        Alert.alert(
          t("admin.addonManagement.permissionsRequired"),
          t("admin.addonManagement.grantPermissions")
        );
      }
    })();
  }, []);

  useEffect(() => {
    loadBranches();
    fetchCategories();
    if (isEditing && params.id) {
      loadAddon(params.id);
    } else {
      setLoading(false);
    }
  }, [params.id]);

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const authToken = token || undefined;
      const apiService = ApiService.getInstance();
      try {
        const result = await apiService.get("/api/admin/branches", authToken);
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

      const fallbackResult = await apiService.get("/api/user/branches/my", authToken);
      if (fallbackResult.success && fallbackResult.data) {
        setBranches(fallbackResult.data);
      }
    } catch (error) {
      console.error("Error loading branches:", error);
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadBranchPrices = async (addonId: string) => {
    if (!isEditing) return;
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

  const loadAddon = async (id: string) => {
    try {
      setLoading(true);
      const token = await getToken();
      const ad = (await addonService.getAddonById(
        id,
        token || undefined
      )) as Addon;
      
      // Base price is the price field
      const basePrice = ad.price ? parseFloat(ad.price) : 0;
      
      // Calculate additional prices for each size
      const sizes = (ad.addonSizes || []).map((addonSize) => {
        const totalPrice = parseFloat(addonSize.price);
        const additionalPrice = totalPrice - basePrice;
        return {
          sizeType: addonSize.sizeType as "S" | "M" | "L" | "XL",
          price: additionalPrice,
          taxPercentage: addonSize.taxPercentage,
        };
      });
      
      setFormData({
        id: ad.id,
        name: ad.name,
        description: ad.description || "",
        price: basePrice,
        sizes: sizes,
        taxPercentage: ad.taxPercentage,
        type: ad.type,
        image: ad.image || undefined,
        isActive: ad.isActive,
        categoryIds: ad.addonCategories?.map(ac => ac.category.id) || [],
        excludedBranches: (ad as any).excludedBranches || [],
      });
      
      // Load branch prices for editing
      loadBranchPrices(ad.id);
      setPriceText(basePrice ? String(basePrice) : "");
      setTaxText(ad.taxPercentage != null ? String(ad.taxPercentage) : "");
      
      // Initialize size price and tax inputs
      const sizePriceInputs: Record<number, string> = {};
      const sizeTaxInputs: Record<number, string> = {};
      sizes.forEach((size, idx) => {
        sizePriceInputs[idx] = size.price !== null && size.price !== undefined ? String(size.price) : "";
        sizeTaxInputs[idx] = size.taxPercentage !== null && size.taxPercentage !== undefined ? String(size.taxPercentage) : "";
      });
      setSizePriceInputs(sizePriceInputs);
      setSizeTaxInputs(sizeTaxInputs);
    } catch (e) {
      console.error("Load addon error:", e);
      setToast({
        visible: true,
        message: t("admin.addonManagement.loadAddonError"),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

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
    } catch (e) {
      console.error("Pick image error:", e);
      setToast({
        visible: true,
        message: t("admin.addonManagement.pickImageError"),
        type: "error",
      });
    }
  };

  const handleEditAndUploadImage = async (imageUri: string) => {
    try {
      setIsUploadingImage(true);
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      await uploadImageToServer(manipulated.uri);
    } catch (e) {
      console.error("Edit/upload image error:", e);
      setToast({
        visible: true,
        message: t("admin.addonManagement.processImageError"),
        type: "error",
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const uploadImageToServer = async (imageUri: string) => {
    const token = await getToken();
    const uploadFormData = new FormData();
    const filename = imageUri.split("/").pop() || `addon_${Date.now()}.jpg`;
    const match = /(\.\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : "image/jpeg";
    // @ts-ignore RN FormData
    uploadFormData.append("image", {
      uri: imageUri,
      name: filename,
      type,
    } as any);
    const res = await fetch(`${API_BASE_URL}/api/upload/image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: uploadFormData,
    });
    if (!res.ok) throw new Error(`Upload failed ${res.status}`);
    const data = await res.json();
    if (data.success && data.data) {
      setFormData((prev) => ({ ...prev, image: data.data.filename }));
      setToast({
        visible: true,
        message: t("admin.addonManagement.imageUploaded"),
        type: "success",
      });
    } else {
      throw new Error("Invalid response");
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
          message: t("admin.addonManagement.validPriceRequired"),
          type: "error",
        });
        return;
      }

      await addonService.upsertAddonBranchPrice(
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
        message: t("admin.addonManagement.branchPriceSaved"),
        type: "success",
      });
    } catch (error) {
      console.error("Failed to save branch price:", error);
      setToast({
        visible: true,
        message: t("admin.addonManagement.failedToSaveBranchPrice"),
        type: "error",
      });
    }
  };

  const handleDeleteBranchPrice = async () => {
    if (!branchPriceToDelete || !formData.id) return;

    try {
      const token = await getToken();
      await addonService.deleteAddonBranchPrice(formData.id, branchPriceToDelete.branchId, token || undefined);
      // Reload branch prices
      await loadBranchPrices(formData.id);
      setBranchPriceToDelete(null);
      setToast({
        visible: true,
        message: t("admin.addonManagement.branchPriceDeleted"),
        type: "success",
      });
    } catch (error) {
      console.error("Failed to delete branch price:", error);
      setToast({
        visible: true,
        message: t("admin.addonManagement.failedToDeleteBranchPrice"),
        type: "error",
      });
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setToast({
        visible: true,
        message: t("admin.addonManagement.nameRequired"),
        type: "error",
      });
      return;
    }
    if (formData.price == null || isNaN(formData.price) || formData.price < 0) {
      setToast({
        visible: true,
        message: t("admin.addonManagement.validPriceRequired"),
        type: "error",
      });
      return;
    }
    if (!formData.sizes || formData.sizes.length === 0) {
      setToast({
        visible: true,
        message: t("admin.addonManagement.atLeastOneSizeRequired"),
        type: "error",
      });
      return;
    }
    try {
      setIsSubmitting(true);
      const token = await getToken();
      
      // Normalize sizes - convert null prices to 0
      const normalizedSizes = formData.sizes.map((size) => ({
        sizeType: size.sizeType,
        price: size.price ?? 0,
        taxPercentage: size.taxPercentage ?? null,
      }));
      
      if (formData.id) {
        await addonService.updateAddon(
          formData.id,
          {
            name: formData.name.trim(),
            description: formData.description || "",
            price: formData.price,
            sizes: normalizedSizes,
            taxPercentage: formData.taxPercentage ?? null,
            image: formData.image,
            type: formData.type,
            isActive: formData.isActive,
            categoryIds: formData.categoryIds || [],
            excludedBranches: formData.excludedBranches || [],
          },
          token || undefined
        );
        setToast({
          visible: true,
          message: t("admin.addonManagement.addonUpdated"),
          type: "success",
        });
      } else {
        await addonService.createAddon(
          {
            name: formData.name.trim(),
            description: formData.description || "",
            price: formData.price,
            sizes: normalizedSizes,
            taxPercentage: formData.taxPercentage ?? null,
            image: formData.image,
            type: formData.type,
            isActive: formData.isActive ?? true,
            categoryIds: formData.categoryIds || [],
            excludedBranches: formData.excludedBranches || [],
          },
          token || undefined
        );
        setToast({
          visible: true,
          message: t("admin.addonManagement.addonCreated"),
          type: "success",
        });
      }
      setTimeout(() => router.back(), 400);
    } catch (e) {
      console.error("Save addon error:", e);
      setToast({
        visible: true,
        message: t("admin.addonManagement.saveAddonError"),
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={
            isEditing
              ? t("admin.addonManagement.editAddon")
              : t("admin.addonManagement.createAddon")
          }
          onBackPress={() => router.back()}
        />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.addonManagement.loading")}
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
            ? t("admin.addonManagement.editAddon")
            : t("admin.addonManagement.createAddon")
        }
        onBackPress={() => router.back()}
      />

      <ScrollView
        style={styles.form}
        contentContainerStyle={{ 
          paddingTop: headerHeight + 10,
          paddingBottom: 100 
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("admin.addonManagement.name")}{" "}
            <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t("admin.addonManagement.namePlaceholder")}
            placeholderTextColor="#6B7280"
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("admin.addonManagement.description")}
          </Text>
          <TextInput
            style={styles.textArea}
            placeholder={t("admin.addonManagement.descriptionPlaceholder")}
            placeholderTextColor="#6B7280"
            value={formData.description || ""}
            onChangeText={(text) =>
              setFormData({ ...formData, description: text })
            }
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("admin.addonManagement.basePrice")}{" "}
            <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.hintText}>
            {t("admin.addonManagement.basePriceHint")}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t("admin.addonManagement.basePricePlaceholder")}
            placeholderTextColor="#6B7280"
            keyboardType="decimal-pad"
            value={priceText}
            onChangeText={(text) => {
              let cleaned = text.replace(/[^0-9.]/g, "");
              const parts = cleaned.split(".");
              if (parts.length > 2)
                cleaned = parts[0] + "." + parts.slice(1).join("");
              setPriceText(cleaned);
              if (cleaned === "" || cleaned === ".") {
                setFormData({ ...formData, price: null });
              } else {
                const num = parseFloat(cleaned);
                if (!isNaN(num)) setFormData({ ...formData, price: num });
              }
            }}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("admin.addonManagement.taxPercentage")}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t("admin.addonManagement.taxPercentagePlaceholder")}
            placeholderTextColor="#6B7280"
            keyboardType="decimal-pad"
            value={taxText}
            onChangeText={(text) => {
              let cleaned = text.replace(/[^0-9.]/g, "");
              const parts = cleaned.split(".");
              if (parts.length > 2)
                cleaned = parts[0] + "." + parts.slice(1).join("");
              setTaxText(cleaned);
              if (cleaned === "" || cleaned === ".") {
                setFormData({ ...formData, taxPercentage: null });
              } else {
                const num = parseFloat(cleaned);
                if (!isNaN(num))
                  setFormData({ ...formData, taxPercentage: num });
              }
            }}
          />
        </View>

        {/* Sizes Section */}
        <View style={styles.formGroup}>
          <View style={styles.formGroupHeader}>
            <Text style={styles.label}>
              {t("admin.addonManagement.sizes")}{" "}
              <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              style={styles.addSizeButton}
              onPress={() => {
                const availableSizes: ("S" | "M" | "L" | "XL")[] = ["S", "M", "L", "XL"];
                const usedSizes = formData.sizes?.map(s => s.sizeType) || [];
                const nextSize = availableSizes.find(size => !usedSizes.includes(size));
                if (nextSize && formData.sizes.length < 4) {
                  const newIndex = formData.sizes.length;
                  setFormData({
                    ...formData,
                    sizes: [
                      ...formData.sizes,
                      { sizeType: nextSize, price: 0, taxPercentage: null },
                    ],
                  });
                  // Initialize empty inputs for new size
                  setSizePriceInputs(prev => ({ ...prev, [newIndex]: "" }));
                  setSizeTaxInputs(prev => ({ ...prev, [newIndex]: "" }));
                }
              }}
              disabled={formData.sizes.length >= 4}
            >
              <MaterialCommunityIcons name="plus" size={14} color="#ec4899" />
              <Text style={styles.addSizeButtonText}>
                {t("admin.addonManagement.addSize")}
              </Text>
            </TouchableOpacity>
          </View>
          {formData.sizes.length === 0 ? (
            <Text style={styles.hintText}>
              {t("admin.addonManagement.noSizesAdded")}
            </Text>
          ) : (
            formData.sizes.map((size, index) => {
              const usedSizes = formData.sizes.map(s => s.sizeType);
              return (
                <View key={index} style={styles.sizeItemContainer}>
                  <View style={styles.sizeItemHeader}>
                    <Text style={styles.sizeItemLabel}>
                      {t("admin.addonManagement.size")} {size.sizeType}
                    </Text>
                    <TouchableOpacity
                      style={styles.removeSizeButton}
                      onPress={() => {
                        const newSizes = formData.sizes.filter((_, i) => i !== index);
                        setFormData({
                          ...formData,
                          sizes: newSizes,
                        });
                        // Remove the input state for this size and reindex
                        const newPriceInputs: Record<number, string> = {};
                        const newTaxInputs: Record<number, string> = {};
                        formData.sizes.forEach((_, i) => {
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
                      }}
                    >
                      <MaterialCommunityIcons name="delete" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.sizeTypeContainer}>
                    {(["S", "M", "L", "XL"] as const).map((sizeType) => (
                      <TouchableOpacity
                        key={sizeType}
                        style={[
                          styles.sizeTypeButton,
                          size.sizeType === sizeType && styles.sizeTypeButtonActive,
                          usedSizes.filter(s => s === sizeType).length > 1 && size.sizeType !== sizeType && styles.sizeTypeButtonDisabled,
                        ]}
                        onPress={() => {
                          if (usedSizes.filter(s => s === sizeType).length > 1 && size.sizeType !== sizeType) return;
                          setFormData({
                            ...formData,
                            sizes: formData.sizes.map((s, i) =>
                              i === index ? { ...s, sizeType } : s
                            ),
                          });
                        }}
                        disabled={usedSizes.filter(s => s === sizeType).length > 1 && size.sizeType !== sizeType}
                      >
                        <Text
                          style={[
                            styles.sizeTypeButtonText,
                            size.sizeType === sizeType && styles.sizeTypeButtonTextActive,
                            usedSizes.filter(s => s === sizeType).length > 1 && size.sizeType !== sizeType && styles.sizeTypeButtonTextDisabled,
                          ]}
                        >
                          {sizeType}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.sizeInput}
                    placeholder={t("admin.addonManagement.additionalPricePlaceholder")}
                    placeholderTextColor="#6B7280"
                    keyboardType="decimal-pad"
                    value={sizePriceInputs[index] || ""}
                    onChangeText={(text) => {
                      // Clean the input: only allow digits and one decimal point
                      let cleaned = text.replace(/[^0-9.]/g, "");
                      
                      // Ensure only one decimal point
                      const parts = cleaned.split(".");
                      if (parts.length > 2) {
                        cleaned = parts[0] + "." + parts.slice(1).join("");
                      }
                      
                      // Update the input state with cleaned value
                      setSizePriceInputs(prev => ({ ...prev, [index]: cleaned }));
                      
                      // Update form data
                      if (cleaned === "" || cleaned === ".") {
                        setFormData({
                          ...formData,
                          sizes: formData.sizes.map((s, i) =>
                            i === index ? { ...s, price: 0 } : s
                          ),
                        });
                      } else {
                        const numValue = parseFloat(cleaned);
                        if (!isNaN(numValue) && numValue >= 0) {
                          setFormData({
                            ...formData,
                            sizes: formData.sizes.map((s, i) =>
                              i === index ? { ...s, price: numValue } : s
                            ),
                          });
                        }
                      }
                    }}
                  />
                  <Text style={styles.hintText}>
                    {t("admin.addonManagement.totalPrice")}: ${((formData.price || 0) + (size.price || 0)).toFixed(2)}
                  </Text>
                  <TextInput
                    style={[styles.sizeInput, { marginTop: 8 }]}
                    placeholder={t("admin.addonManagement.taxPercentPlaceholder") || "Tax % (optional)"}
                    placeholderTextColor="#6B7280"
                    keyboardType="decimal-pad"
                    value={sizeTaxInputs[index] || ""}
                    onChangeText={(text) => {
                      // Clean the input: only allow digits and one decimal point
                      let cleaned = text.replace(/[^0-9.]/g, "");
                      
                      // Ensure only one decimal point
                      const parts = cleaned.split(".");
                      if (parts.length > 2) {
                        cleaned = parts[0] + "." + parts.slice(1).join("");
                      }
                      
                      // Update the input state with cleaned value
                      setSizeTaxInputs(prev => ({ ...prev, [index]: cleaned }));
                      
                      // Update form data
                      if (cleaned === "" || cleaned === ".") {
                        setFormData({
                          ...formData,
                          sizes: formData.sizes.map((s, i) =>
                            i === index ? { ...s, taxPercentage: null } : s
                          ),
                        });
                      } else {
                        const numValue = parseFloat(cleaned);
                        if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
                          setFormData({
                            ...formData,
                            sizes: formData.sizes.map((s, i) =>
                              i === index ? { ...s, taxPercentage: numValue } : s
                            ),
                          });
                        }
                      }
                    }}
                  />
                </View>
              );
            })
          )}
        </View>

        {/* Type Selector */}
        <View style={styles.formGroupRow}>
          <Text style={styles.label}>{t("admin.addonManagement.type")}</Text>
          <TouchableOpacity
            style={styles.typeButton}
            onPress={() => setShowTypeModal(true)}
          >
            <Text style={styles.typeButtonText}>
              {formData.type === "BOOLEAN"
                ? t("admin.addonManagement.typeToggle")
                : t("admin.addonManagement.typeQuantity")}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={16} color="#D1D5DB" />
          </TouchableOpacity>
        </View>

        {/* Categories Selection */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("admin.addonManagement.categories")}
          </Text>
          <TouchableOpacity
            style={styles.categoriesButton}
            onPress={() => setShowCategoriesModal(true)}
          >
            <View style={styles.categoriesButtonContent}>
              {formData.categoryIds && formData.categoryIds.length > 0 ? (
                <View style={styles.selectedCategoriesPreview}>
                  <Text style={styles.selectedCategoriesText}>
                    {formData.categoryIds.length}{" "}
                    {formData.categoryIds.length === 1
                      ? t("admin.addonManagement.category")
                      : t("admin.addonManagement.categories")}{" "}
                    {t("admin.addonManagement.selected")}
                  </Text>
                  <View style={styles.selectedCategoriesBadges}>
                    {categories
                      .filter((cat) => formData.categoryIds?.includes(cat.id))
                      .slice(0, 3)
                      .map((category) => (
                        <View key={category.id} style={styles.previewBadge}>
                          <Text style={styles.previewBadgeText}>
                            {category.name}
                          </Text>
                        </View>
                      ))}
                    {formData.categoryIds && formData.categoryIds.length > 3 && (
                      <Text style={styles.moreCategoriesText}>
                        +{formData.categoryIds.length - 3}
                      </Text>
                    )}
                  </View>
                </View>
              ) : (
                <Text style={styles.categoriesButtonPlaceholder}>
                  {t("admin.addonManagement.selectCategory")}
                </Text>
              )}
              <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.hintText}>
            {t("admin.addonManagement.categoryHint")}
          </Text>
        </View>

        {/* Active Toggle */}
        <View style={styles.formGroupRow}>
          <Text style={styles.label}>{t("admin.addonManagement.active")}</Text>
          <Switch
            value={!!formData.isActive}
            onValueChange={(v) => setFormData({ ...formData, isActive: v })}
            trackColor={{ true: "#ec4899", false: "#374151" }}
            thumbColor="#fff"
          />
        </View>

        {/* Excluded Branches Section */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("admin.addonManagement.excludedBranches")}
          </Text>
          <Text style={styles.hintText}>
            {t("admin.addonManagement.excludedBranchesDescription")}
          </Text>
          {loadingBranches ? (
            <View style={styles.branchesLoadingContainer}>
              <ActivityIndicator size="small" color="#ec4899" />
              <Text style={styles.branchesLoadingText}>
                {t("admin.addonManagement.loadingBranches")}
              </Text>
            </View>
          ) : branches.length === 0 ? (
            <View style={styles.branchesEmptyContainer}>
              <Text style={styles.branchesEmptyText}>
                {t("admin.addonManagement.noBranchesAvailable")}
              </Text>
            </View>
          ) : (
            <View style={styles.branchesContainer}>
              {branches.map((branch) => {
                const isExcluded = formData.excludedBranches?.includes(branch.id) || false;
                return (
                  <TouchableOpacity
                    key={branch.id}
                    style={[
                      styles.branchOption,
                      isExcluded && styles.branchOptionSelected,
                    ]}
                    onPress={() => toggleExcludedBranch(branch.id)}
                  >
                    <View style={styles.branchOptionContent}>
                      <View
                        style={[
                          styles.checkbox,
                          isExcluded && styles.checkboxSelected,
                        ]}
                      >
                        {isExcluded && (
                          <MaterialCommunityIcons
                            name="check"
                            size={12}
                            color="#fff"
                          />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.branchOptionText,
                          isExcluded && styles.branchOptionTextSelected,
                        ]}
                      >
                        {branch.name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {formData.excludedBranches && formData.excludedBranches.length > 0 && (
            <View style={styles.excludedBranchesSummary}>
              <Text style={styles.excludedBranchesSummaryText}>
                {t("admin.addonManagement.branchesExcluded", {
                  count: formData.excludedBranches.length,
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Branch-Specific Prices Section - Only show when editing */}
        {isEditing && formData.id && (
          <View style={styles.formGroup}>
            <View style={styles.formGroupHeader}>
              <View style={styles.formGroupHeaderText}>
                <Text style={styles.label}>
                  {t("admin.addonManagement.branchSpecificPrices")}
                </Text>
                <Text style={styles.hintText}>
                  {t("admin.addonManagement.branchSpecificPricesDescription")}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.addBranchPriceButton}
                onPress={() => {
                  setEditingBranchPrice({
                    branchId: "",
                    basePrice: formData.price?.toString() || "0",
                    taxPercentage: formData.taxPercentage?.toString() || "",
                  });
                }}
                disabled={isSubmitting}
              >
                <MaterialCommunityIcons name="plus" size={14} color="#ec4899" />
                <Text style={styles.addBranchPriceButtonText}>
                  {t("admin.addonManagement.addBranchPrice")}
                </Text>
              </TouchableOpacity>
            </View>

            {loadingBranchPrices ? (
              <View style={styles.branchesLoadingContainer}>
                <ActivityIndicator size="small" color="#ec4899" />
                <Text style={styles.branchesLoadingText}>
                  {t("admin.addonManagement.loadingBranchPrices")}
                </Text>
              </View>
            ) : branchPrices.length === 0 ? (
              <View style={styles.branchesEmptyContainer}>
                <Text style={styles.branchesEmptyText}>
                  {t("admin.addonManagement.noBranchPricesSet")}
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
                          {t("admin.addonManagement.price")}: ${parseFloat(bp.basePrice).toFixed(2)}
                        </Text>
                        {bp.taxPercentage !== null && (
                          <Text style={styles.branchPriceItemDetail}>
                            {t("admin.addonManagement.tax")}: {bp.taxPercentage}%
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
                      ? t("admin.addonManagement.editBranchPrice")
                      : t("admin.addonManagement.addBranchPrice")}
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
                    {t("admin.addonManagement.branch")}
                  </Text>
                  <TouchableOpacity
                    style={styles.branchPriceFormSelect}
                    onPress={() => {
                      // Show branch picker modal
                      // For now, we'll use a simple approach - show branches that aren't already in branchPrices
                      const availableBranches = branches.filter(
                        (b) =>
                          !branchPrices.find(
                            (bp) =>
                              bp.branchId === b.id &&
                              bp.branchId !== editingBranchPrice.branchId
                          )
                      );
                      if (availableBranches.length > 0) {
                        const buttons: AlertButton[] = [
                          ...availableBranches.map((branch) => ({
                            text: branch.name,
                            onPress: () => {
                              setEditingBranchPrice({
                                ...editingBranchPrice,
                                branchId: branch.id,
                              });
                            },
                          })),
                          {
                            text: t("common.cancel"),
                            style: "cancel",
                          },
                        ];
                        Alert.alert(
                          t("admin.addonManagement.selectBranch"),
                          "",
                          buttons
                        );
                      }
                    }}
                  >
                    <Text style={[
                      styles.branchPriceFormSelectText,
                      !editingBranchPrice.branchId && styles.branchPriceFormSelectPlaceholder
                    ]}>
                      {editingBranchPrice.branchId
                        ? branches.find(b => b.id === editingBranchPrice.branchId)?.name || t("admin.addonManagement.selectBranch")
                        : t("admin.addonManagement.selectBranch")}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                <View style={styles.branchPriceFormField}>
                  <Text style={styles.branchPriceFormLabel}>
                    {t("admin.addonManagement.basePrice")}
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
                    {t("admin.addonManagement.taxPercentage")} ({t("admin.addonManagement.optional")})
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
                      {t("admin.addonManagement.save")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Image */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>{t("admin.addonManagement.image")}</Text>
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
                    {t("admin.addonManagement.change")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setFormData({ ...formData, image: undefined })}
                  disabled={isUploadingImage}
                >
                  <MaterialCommunityIcons name="delete" size={14} color="#fff" />
                  <Text style={styles.removeImageButtonText}>
                    {t("admin.addonManagement.remove")}
                  </Text>
                </TouchableOpacity>
              </View>
              {isUploadingImage && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color="#ec4899" />
                  <Text style={styles.uploadingText}>
                    {t("admin.addonManagement.processingImage")}
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
                <MaterialCommunityIcons name="camera" size={24} color="#ec4899" />
                <Text style={styles.imagePickerButtonText}>
                  {t("admin.addonManagement.addAddonImage")}
                </Text>
              </TouchableOpacity>
              <Text style={styles.imagePickerHint}>
                {t("admin.addonManagement.chooseFromLibraryOrPhoto")}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer Actions */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={isSubmitting}
        >
          <Text style={styles.cancelButtonText}>
            {t("admin.addonManagement.cancel")}
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
                  ? t("admin.addonManagement.update")
                  : t("admin.addonManagement.create")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

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
                {t("admin.addonManagement.selectImage")}
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
                    {t("admin.addonManagement.chooseFromLibrary")}
                  </Text>
                  <Text style={styles.imagePickerOptionSubtitle}>
                    {t("admin.addonManagement.selectExistingPhoto")}
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
                    {t("admin.addonManagement.takePhoto")}
                  </Text>
                  <Text style={styles.imagePickerOptionSubtitle}>
                    {t("admin.addonManagement.captureNewPhoto")}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Type Selector Bottom Sheet */}
      <Modal
        visible={showTypeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTypeModal(false)}
      >
        <Pressable
          style={styles.imagePickerModalContainer}
          onPress={() => setShowTypeModal(false)}
        >
          <Pressable
            style={styles.typeModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.imagePickerModalHeader}>
              <Text style={styles.imagePickerModalTitle}>
                {t("admin.addonManagement.selectAddonType")}
              </Text>
              <TouchableOpacity onPress={() => setShowTypeModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[
                styles.typeOption,
                formData.type === "BOOLEAN" && styles.typeOptionActive,
              ]}
              onPress={() => {
                setFormData({ ...formData, type: "BOOLEAN" });
                setShowTypeModal(false);
              }}
            >
              <Text
                style={[
                  styles.typeOptionText,
                  formData.type === "BOOLEAN" && styles.typeOptionTextActive,
                ]}
              >
                {t("admin.addonManagement.typeToggle")}
              </Text>
              {formData.type === "BOOLEAN" && (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={18}
                  color="#ec4899"
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeOption,
                formData.type === "QUANTITY" && styles.typeOptionActive,
              ]}
              onPress={() => {
                setFormData({ ...formData, type: "QUANTITY" });
                setShowTypeModal(false);
              }}
            >
              <Text
                style={[
                  styles.typeOptionText,
                  formData.type === "QUANTITY" && styles.typeOptionTextActive,
                ]}
              >
                {t("admin.addonManagement.typeQuantity")}
              </Text>
              {formData.type === "QUANTITY" && (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={18}
                  color="#ec4899"
                />
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Categories Selection Bottom Sheet */}
      <Modal
        visible={showCategoriesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoriesModal(false)}
      >
        <Pressable
          style={styles.imagePickerModalContainer}
          onPress={() => setShowCategoriesModal(false)}
        >
          <Pressable
            style={styles.categoriesModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.imagePickerModalHeader}>
              <Text style={styles.imagePickerModalTitle}>
                {t("admin.addonManagement.categories")}
              </Text>
              <TouchableOpacity onPress={() => setShowCategoriesModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.categoriesModalList}
              showsVerticalScrollIndicator={false}
            >
              {categoriesLoading ? (
                <View style={styles.categoriesLoadingContainer}>
                  <ActivityIndicator size="small" color="#ec4899" />
                  <Text style={styles.categoriesLoadingText}>
                    {t("admin.addonManagement.loadingCategories")}
                  </Text>
                </View>
              ) : categories.filter((cat) => cat.isActive).length === 0 ? (
                <Text style={styles.categoriesEmptyText}>
                  {t("admin.addonManagement.noCategoriesAvailable")}
                </Text>
              ) : (
                categories
                  .filter((cat) => cat.isActive)
                  .map((category) => {
                    const isSelected =
                      formData.categoryIds?.includes(category.id) || false;
                    return (
                      <TouchableOpacity
                        key={category.id}
                        style={[
                          styles.categoryModalItem,
                          isSelected && styles.categoryModalItemSelected,
                        ]}
                        onPress={() => {
                          const currentIds = formData.categoryIds || [];
                          if (isSelected) {
                            setFormData({
                              ...formData,
                              categoryIds: currentIds.filter(
                                (id) => id !== category.id
                              ),
                            });
                          } else {
                            setFormData({
                              ...formData,
                              categoryIds: [...currentIds, category.id],
                            });
                          }
                        }}
                      >
                        <View
                          style={[
                            styles.categoryCheckbox,
                            isSelected && styles.categoryCheckboxChecked,
                          ]}
                        >
                          {isSelected && (
                            <MaterialCommunityIcons name="check" size={14} color="#fff" />
                          )}
                        </View>
                        <Text style={styles.categoryName}>{category.name}</Text>
                      </TouchableOpacity>
                    );
                  })
              )}
            </ScrollView>
            <View style={styles.categoriesModalFooter}>
              <TouchableOpacity
                style={styles.categoriesModalDoneButton}
                onPress={() => setShowCategoriesModal(false)}
              >
                <Text style={styles.categoriesModalDoneButtonText}>
                  {t("admin.addonManagement.done")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
              {t("admin.addonManagement.deleteBranchPrice")}
            </Text>
            <Text style={styles.deleteModalText}>
              {t("admin.addonManagement.deleteBranchPriceDescription", {
                branch: branchPriceToDelete?.branchName || "",
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
              >
                <Text style={styles.deleteModalConfirmButtonText}>
                  {t("admin.addonManagement.delete")}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
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
  headerRight: { width: 32 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#9CA3AF" },
  form: { flex: 1, padding: 16 },
  formGroup: { marginBottom: 16 },
  formRow: { marginBottom: 16, flexDirection: "row" },
  label: { fontSize: 14, color: "#D1D5DB", marginBottom: 8, fontWeight: "600" },
  required: { color: "#ef4444" },
  input: {
    backgroundColor: "#171717",
    borderRadius: 8,
    padding: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#262626",
  },
  textArea: {
    backgroundColor: "#171717",
    borderRadius: 8,
    padding: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#262626",
    minHeight: 100,
    textAlignVertical: "top",
  },
  formGroupRow: {
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
  },
  typeButtonText: { color: "#D1D5DB", fontWeight: "600" },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
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

  imagePickerContainer: { marginTop: 12, alignItems: "center" },
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
  imagePickerButtonText: { fontSize: 16, fontWeight: "600", color: "#ec4899" },
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
  imagePreviewImage: { width: "100%", height: "100%" },
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
  changeImageButtonText: { fontSize: 13, fontWeight: "600", color: "#fff" },
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
  removeImageButtonText: { fontSize: 13, fontWeight: "600", color: "#fff" },
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
  uploadingText: { fontSize: 14, color: "#fff", fontWeight: "500" },

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
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  imagePickerModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  imagePickerModalTitle: { fontSize: 20, fontWeight: "700", color: "#fff" },
  imagePickerOptions: { gap: 16 },
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
  imagePickerOptionText: { flex: 1 },
  imagePickerOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  imagePickerOptionSubtitle: { fontSize: 13, color: "#9CA3AF" },

  typeModalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  typeOptionActive: { backgroundColor: "rgba(236, 72, 153, 0.1)" },
  typeOptionText: { fontSize: 15, color: "#D1D5DB", fontWeight: "500" },
  typeOptionTextActive: { color: "#ec4899", fontWeight: "600" },
  categoriesButton: {
    backgroundColor: "#171717",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    marginTop: 8,
  },
  categoriesButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  selectedCategoriesPreview: {
    flex: 1,
    gap: 8,
  },
  selectedCategoriesText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
    marginBottom: 4,
  },
  selectedCategoriesBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  previewBadge: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "#ec4899",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewBadgeText: {
    fontSize: 11,
    color: "#ec4899",
    fontWeight: "600",
  },
  moreCategoriesText: {
    fontSize: 11,
    color: "#ec4899",
    fontWeight: "600",
  },
  categoriesButtonPlaceholder: {
    fontSize: 15,
    color: "#6B7280",
    flex: 1,
  },
  categoryCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#404040",
    justifyContent: "center",
    alignItems: "center",
  },
  categoryCheckboxChecked: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  categoryName: {
    fontSize: 15,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  categoriesLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
    justifyContent: "center",
  },
  categoriesLoadingText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  categoriesEmptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingVertical: 20,
  },
  hintText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 6,
  },
  categoriesModalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "80%",
  },
  categoriesModalList: {
    maxHeight: 400,
    marginTop: 16,
  },
  categoryModalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#262626",
  },
  categoryModalItemSelected: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  categoriesModalFooter: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  categoriesModalDoneButton: {
    backgroundColor: "#ec4899",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  categoriesModalDoneButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  formGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
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
    marginBottom: 16,
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
  removeSizeButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
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
  sizeTypeButtonDisabled: {
    opacity: 0.5,
  },
  sizeTypeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  sizeTypeButtonTextActive: {
    color: "#ec4899",
  },
  sizeTypeButtonTextDisabled: {
    color: "#6B7280",
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
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#6B7280",
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
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
});
