import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Dimensions,
} from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
import { Switch } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { Toast } from "@/components/Toast";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";

import { dealService, type Deal, type DealComponent, type DealFormData } from "@/src/services/dealService";
import { categoryService, type Category } from "@/src/services/categoryService";
import { addonService, type Addon } from "@/src/services/addonService";
import { declarationService, type Declaration } from "@/src/services/declarationService";
import { optionalIngredientService, type OptionalIngredient } from "@/src/services/optionalIngredientService";
import branchService, { type Branch } from "@/src/services/branchService";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const parseNumber = (value: string): number => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeQuantity = (value: unknown): number => {
  const n = typeof value === "number" ? value : parseNumber(String(value ?? ""));
  const rounded = Math.round(n);
  return Number.isFinite(rounded) && rounded > 0 ? rounded : 1;
};

const getOptimizedImageUrl = (imagePath: string): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

export default function DealFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; categoryId?: string }>();
  const { getToken } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();

  const isEditing = !!params.id;
  const initialCategoryId = typeof params.categoryId === "string" ? params.categoryId : "";

  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);

    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection("down");
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection("up");
    }

    lastScrollY.current = currentScrollY;
  };

  const [loading, setLoading] = useState(isEditing);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [categories, setCategories] = useState<Category[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [optionalIngredients, setOptionalIngredients] = useState<OptionalIngredient[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showAddonsModal, setShowAddonsModal] = useState(false);
  const [showDeclarationsModal, setShowDeclarationsModal] = useState(false);
  const [showOptionalIngredientsModal, setShowOptionalIngredientsModal] = useState(false);

  const [addonSearchTerm, setAddonSearchTerm] = useState("");
  const [declarationSearchTerm, setDeclarationSearchTerm] = useState("");
  const [optionalIngredientSearchTerm, setOptionalIngredientSearchTerm] = useState("");

  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const [formData, setFormData] = useState<DealFormData>({
    name: "",
    description: "",
    sku: "",
    image: undefined,
    categoryId: initialCategoryId,
    excludedBranches: [],
    isActive: true,
    isFeatured: false,
    components: [],
    addOnIds: [],
    declarationIds: [],
    optionalIngredientIds: [],
  });

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === formData.categoryId) || null,
    [categories, formData.categoryId]
  );

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    (async () => {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!cameraPermission.granted || !mediaPermission.granted) {
        Alert.alert(t("admin.dealForm.permissionsRequired"), t("admin.dealForm.grantPermissions"));
      }
    })();
  }, [t]);

  useEffect(() => {
    loadReferenceData();
    loadBranches();
    if (isEditing && params.id) {
      loadDeal(params.id);
    }
  }, [params.id]);

  const loadReferenceData = async () => {
    try {
      const token = await getToken();
      const [cats, adds, decls, opts] = await Promise.all([
        categoryService.getCategories(1, 100, "", "name", "asc", token || undefined),
        addonService.getAddons(1, 200, "", "name", "asc", token || undefined),
        declarationService.getAllDeclarations(undefined, token || undefined),
        optionalIngredientService.getAllOptionalIngredients(token || undefined),
      ]);

      setCategories(cats.categories);
      setAddons(adds.addons);
      setDeclarations(Array.isArray(decls) ? decls : []);
      setOptionalIngredients(Array.isArray(opts) ? opts : []);
    } catch (e) {
      console.error("Failed to load reference data:", e);
    }
  };

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      if (!selectedOrganizationId) {
        setBranches([]);
        return;
      }

      const b = await branchService.getBranches(token || undefined, {
        organizationId: selectedOrganizationId,
      });
      setBranches(Array.isArray(b) ? b : []);
    } catch (e) {
      console.error("Failed to load branches:", e);
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadDeal = async (id: string) => {
    try {
      setLoading(true);
      const token = await getToken();
      const deal = await dealService.getDealById(id, token || undefined);
      hydrateForm(deal);
    } catch (e) {
      console.error("Failed to load deal:", e);
      setToast({ visible: true, message: t("admin.dealForm.loadError"), type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const hydrateForm = (deal: Deal) => {
    setFormData({
      name: deal.name,
      description: deal.description || "",
      sku: deal.sku || "",
      image: deal.image || undefined,
      categoryId: deal.categoryId,
      excludedBranches: deal.excludedBranches || [],
      isActive: deal.isActive,
      isFeatured: deal.isFeatured || false,
      components: (deal.components || []).map((c, idx) => ({
        id: c.id,
        name: c.name,
        quantity: (c as any).quantity ?? 1,
        price: typeof (c as any).price === "number" ? (c as any).price : parseNumber(String((c as any).price ?? 0)),
        taxPercentage:
          typeof (c as any).taxPercentage === "number"
            ? (c as any).taxPercentage
            : parseNumber(String((c as any).taxPercentage ?? 0)),
        sortOrder: c.sortOrder ?? idx,
      })),
      addOnIds: deal.dealAddOns?.map((a) => a.addOn?.id).filter(Boolean) || [],
      declarationIds: deal.dealDeclarations?.map((d) => d.declaration?.id).filter(Boolean) || [],
      optionalIngredientIds:
        deal.dealOptionalIngredients?.map((o) => o.optionalIngredient?.id).filter(Boolean) || [],
    });
  };

  const addComponent = () => {
    const idx = formData.components.length;
    setFormData((prev) => ({
      ...prev,
      components: [
        ...prev.components,
        {
          name: "",
          quantity: 1,
          price: 0,
          taxPercentage: 0,
          sortOrder: idx,
        },
      ],
    }));
  };

  const removeComponent = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      components: prev.components.filter((_, i) => i !== index).map((c, i) => ({ ...c, sortOrder: i })),
    }));
  };

  const updateComponent = (index: number, patch: Partial<DealComponent>) => {
    setFormData((prev) => {
      const next = [...prev.components];
      next[index] = { ...next[index], ...patch };
      return { ...prev, components: next };
    });
  };

  const toggleId = (current: string[] | undefined, id: string): string[] => {
    const list = current || [];
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  };

  const toggleExcludedBranch = (branchId: string) => {
    setFormData((prev) => ({ ...prev, excludedBranches: toggleId(prev.excludedBranches, branchId) }));
  };

  const toggleAddon = (addonId: string) => {
    setFormData((prev) => ({ ...prev, addOnIds: toggleId(prev.addOnIds, addonId) }));
  };

  const toggleDeclaration = (declarationId: string) => {
    setFormData((prev) => ({ ...prev, declarationIds: toggleId(prev.declarationIds, declarationId) }));
  };

  const toggleOptionalIngredient = (optionalIngredientId: string) => {
    setFormData((prev) => ({
      ...prev,
      optionalIngredientIds: toggleId(prev.optionalIngredientIds, optionalIngredientId),
    }));
  };

  const filteredAddons = useMemo(() => {
    const q = addonSearchTerm.trim().toLowerCase();
    if (!q) return addons;
    return addons.filter((a) => a.name.toLowerCase().includes(q));
  }, [addons, addonSearchTerm]);

  const filteredDeclarations = useMemo(() => {
    const q = declarationSearchTerm.trim().toLowerCase();
    if (!q) return declarations;
    return declarations.filter((d) => {
      return (
        d.name.toLowerCase().includes(q) ||
        (d.type || "").toLowerCase().includes(q) ||
        (d.description || "").toLowerCase().includes(q)
      );
    });
  }, [declarations, declarationSearchTerm]);

  const filteredOptionalIngredients = useMemo(() => {
    const q = optionalIngredientSearchTerm.trim().toLowerCase();
    if (!q) return optionalIngredients;
    return optionalIngredients.filter((o) => {
      return o.name.toLowerCase().includes(q) || (o.description || "").toLowerCase().includes(q);
    });
  }, [optionalIngredients, optionalIngredientSearchTerm]);

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
      console.error("Error picking image:", e);
      setToast({ visible: true, message: t("admin.dealForm.pickImageError"), type: "error" });
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
      console.error("Error editing/uploading image:", e);
      setToast({ visible: true, message: t("admin.dealForm.processImageError"), type: "error" });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const uploadImageToServer = async (imageUri: string) => {
    const token = await getToken();
    const uploadFormData = new FormData();

    const filename = imageUri.split("/").pop() || `deal_${Date.now()}.jpg`;
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : "image/jpeg";

    // @ts-ignore
    uploadFormData.append("image", {
      uri: imageUri,
      name: filename,
      type,
    } as any);

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
      setToast({ visible: true, message: t("admin.dealForm.imageUploadedSuccess"), type: "success" });
      return;
    }

    throw new Error("Invalid upload response");
  };

  const validate = (): string | null => {
    if (!formData.name.trim()) return t("admin.dealForm.validation.nameRequired");
    if (!formData.categoryId) return t("admin.dealForm.validation.categoryRequired");
    if (!formData.components.length) return t("admin.dealForm.validation.atLeastOneComponent");

    for (const c of formData.components) {
      if (!c.name.trim()) return t("admin.dealForm.validation.componentNameRequired");
      const qty = c.quantity ?? 1;
      if (!Number.isFinite(qty) || qty < 0) return t("admin.dealForm.validation.componentQuantityInvalid");
    }

    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      setToast({ visible: true, message: error, type: "error" });
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      const payload: DealFormData = {
        ...formData,
        components: (formData.components || []).map((c) => ({
          ...c,
          quantity: normalizeQuantity((c as any).quantity),
        })),
      };

      if (isEditing && params.id) {
        await dealService.updateDeal(params.id, payload, token || undefined);
        setToast({ visible: true, message: t("admin.dealForm.updatedSuccess"), type: "success" });
      } else {
        await dealService.createDeal(payload, token || undefined);
        setToast({ visible: true, message: t("admin.dealForm.createdSuccess"), type: "success" });
      }

      setTimeout(() => {
        router.back();
      }, 500);
    } catch (e: any) {
      console.error("Error saving deal:", e);
      const errorMessage = e?.message || t("admin.dealForm.saveError");
      setToast({ visible: true, message: errorMessage, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = isEditing ? t("admin.dealForm.editTitle") : t("admin.dealForm.createTitle");

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AnimatedHeader title={title} onBackPress={() => router.back()} />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: keyboardHeight + 100 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("admin.dealForm.basics")}</Text>

            <Text style={styles.label}>{t("admin.dealForm.nameLabel")}</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              placeholder={t("admin.dealForm.namePlaceholder")}
              placeholderTextColor="#6B7280"
              onChangeText={(v) => setFormData((p) => ({ ...p, name: v }))}
            />

            <Text style={styles.label}>{t("admin.dealForm.descriptionLabel")}</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={formData.description || ""}
              placeholder={t("admin.dealForm.descriptionPlaceholder")}
              placeholderTextColor="#6B7280"
              multiline
              onChangeText={(v) => setFormData((p) => ({ ...p, description: v }))}
            />

            <Text style={styles.label}>{t("admin.dealForm.skuLabel")}</Text>
            <TextInput
              style={styles.input}
              value={formData.sku || ""}
              placeholder={t("admin.dealForm.enterSku")}
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              onChangeText={(v) => setFormData((p) => ({ ...p, sku: v }))}
            />

            <View style={styles.rowBetween}>
              <View style={styles.rowLeft}>
                <Text style={styles.label}>{t("admin.dealForm.isActive")}</Text>
                <Text style={styles.helperText}>{t("admin.dealForm.isActiveDescription")}</Text>
              </View>
              <Switch
                value={!!formData.isActive}
                onValueChange={(v) => setFormData((p) => ({ ...p, isActive: v }))}
                trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.rowBetween}>
              <View style={styles.rowLeft}>
                <Text style={styles.label}>{t("admin.dealForm.isFeatured")}</Text>
                <Text style={styles.helperText}>{t("admin.dealForm.isFeaturedDescription")}</Text>
              </View>
              <Switch
                value={!!formData.isFeatured}
                onValueChange={(v) => setFormData((p) => ({ ...p, isFeatured: v }))}
                trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                thumbColor="#fff"
              />
            </View>

            <Text style={styles.label}>{t("admin.dealForm.image")}</Text>
            <TouchableOpacity
              style={styles.imagePickerButton}
              onPress={() => setShowImagePickerModal(true)}
              disabled={isUploadingImage}
            >
              <MaterialCommunityIcons name="image" size={18} color="#ec4899" />
              <Text style={styles.imagePickerButtonText}>
                {formData.image ? t("admin.dealForm.changeImage") : t("admin.dealForm.addImage")}
              </Text>
              {isUploadingImage ? <ActivityIndicator size="small" color="#ec4899" /> : null}
            </TouchableOpacity>

            {formData.image ? (
              <Image source={{ uri: getOptimizedImageUrl(formData.image) }} style={styles.previewImage} />
            ) : (
              <Text style={styles.helperText}>{t("admin.dealForm.noImage")}</Text>
            )}

            <Text style={styles.label}>{t("admin.dealForm.category")}</Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => {
                if (initialCategoryId && !isEditing) return;
                setShowCategoryModal(true);
              }}
              disabled={!!initialCategoryId && !isEditing}
            >
              <Text style={styles.selectButtonText} numberOfLines={1}>
                {selectedCategory ? selectedCategory.name : t("admin.dealForm.selectCategory")}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>{t("admin.dealForm.components")}</Text>
              <TouchableOpacity style={styles.addButton} onPress={addComponent}>
                <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                <Text style={styles.addButtonText}>{t("common.add")}</Text>
              </TouchableOpacity>
            </View>

            {formData.components.length === 0 ? (
              <Text style={styles.helperText}>{t("admin.dealForm.noComponents")}</Text>
            ) : (
              formData.components.map((c, idx) => (
                <View key={c.id || idx} style={styles.componentCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.componentTitle}>{t("admin.dealForm.component", { index: idx + 1 })}</Text>
                    <TouchableOpacity onPress={() => removeComponent(idx)}>
                      <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.labelSmall}>{t("admin.dealForm.componentName")}</Text>
                  <TextInput
                    style={styles.input}
                    value={c.name}
                    placeholder={t("admin.dealForm.componentNamePlaceholder")}
                    placeholderTextColor="#6B7280"
                    onChangeText={(v) => updateComponent(idx, { name: v })}
                  />

                  <View style={styles.twoColRow}>
                    <View style={styles.twoCol}>
                      <Text style={styles.labelSmall}>{t("admin.dealForm.quantity")}</Text>
                      <TextInput
                        style={styles.input}
                        value={String(c.quantity ?? 1)}
                        keyboardType="numeric"
                        onChangeText={(v) => updateComponent(idx, { quantity: Math.max(0, Math.round(parseNumber(v))) })}
                      />
                    </View>
                    <View style={styles.twoCol}>
                      <Text style={styles.labelSmall}>{t("admin.dealForm.price")}</Text>
                      <TextInput
                        style={styles.input}
                        value={String(c.price ?? 0)}
                        keyboardType="numeric"
                        onChangeText={(v) => updateComponent(idx, { price: parseNumber(v) })}
                      />
                    </View>
                  </View>

                  <Text style={styles.labelSmall}>{t("admin.dealForm.taxPercentage")}</Text>
                  <TextInput
                    style={styles.input}
                    value={String(c.taxPercentage ?? 0)}
                    keyboardType="numeric"
                    onChangeText={(v) => updateComponent(idx, { taxPercentage: parseNumber(v) })}
                  />
                </View>
              ))
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("admin.dealForm.addons")}</Text>
            <TouchableOpacity style={styles.selectButton} onPress={() => setShowAddonsModal(true)}>
              <Text style={styles.selectButtonText}>
                {t("admin.dealForm.addonsSelected", { count: formData.addOnIds?.length || 0 })}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{t("admin.dealForm.declarations")}</Text>
            <TouchableOpacity style={styles.selectButton} onPress={() => setShowDeclarationsModal(true)}>
              <Text style={styles.selectButtonText}>
                {t("admin.dealForm.declarationsSelected", { count: formData.declarationIds?.length || 0 })}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{t("admin.dealForm.optionalIngredients")}</Text>
            <TouchableOpacity style={styles.selectButton} onPress={() => setShowOptionalIngredientsModal(true)}>
              <Text style={styles.selectButtonText}>
                {t("admin.dealForm.optionalIngredientsSelected", { count: formData.optionalIngredientIds?.length || 0 })}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("admin.dealForm.availability")}</Text>

            <Text style={styles.label}>{t("admin.menuManagement.excludedBranches")}</Text>
            <Text style={styles.helperText}>{t("admin.menuManagement.excludedBranchesDescription")}</Text>

            {loadingBranches ? (
              <View style={styles.branchesLoadingContainer}>
                <ActivityIndicator size="small" color="#ec4899" />
                <Text style={styles.branchesLoadingText}>{t("admin.menuManagement.loadingBranches")}</Text>
              </View>
            ) : branches.length === 0 ? (
              <View style={styles.branchesEmptyContainer}>
                <Text style={styles.branchesEmptyText}>{t("admin.menuManagement.noBranchesAvailable")}</Text>
              </View>
            ) : (
              <View style={styles.branchesContainer}>
                {branches.map((branch) => {
                  const isExcluded = formData.excludedBranches?.includes(branch.id) || false;
                  return (
                    <TouchableOpacity
                      key={branch.id}
                      style={[styles.branchOption, isExcluded && styles.branchOptionSelected]}
                      onPress={() => toggleExcludedBranch(branch.id)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.branchOptionContent}>
                        <View style={[styles.branchCheckbox, isExcluded && styles.branchCheckboxSelected]}>
                          {isExcluded && <MaterialCommunityIcons name="check" size={12} color="#fff" />}
                        </View>
                        <Text style={[styles.branchOptionText, isExcluded && styles.branchOptionTextSelected]}>
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
                  {t("admin.menuManagement.branchesExcluded", { count: formData.excludedBranches.length })}
                </Text>
              </View>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer with Cancel and Save buttons */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={isSubmitting}
        >
          <Text style={styles.cancelButtonText}>
            {t("common.cancel") || "Cancel"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, isSubmitting ? styles.saveButtonDisabled : null]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? <ActivityIndicator size="small" color="#fff" /> : null}
          <Text style={styles.saveButtonText}>
            {isSubmitting ? t("admin.dealForm.saving") : t("common.save")}
          </Text>
        </TouchableOpacity>
      </View>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((p) => ({ ...p, visible: false }))}
      />

      <Modal visible={showImagePickerModal} transparent animationType="fade" onRequestClose={() => setShowImagePickerModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowImagePickerModal(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t("admin.dealForm.selectImageTitle")}</Text>
            <TouchableOpacity style={styles.modalItem} onPress={() => handlePickImage("library")}>
              <Text style={styles.modalItemText}>{t("admin.dealForm.chooseFromLibrary")}</Text>
              <MaterialCommunityIcons name="image" size={18} color="#9CA3AF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalItem} onPress={() => handlePickImage("camera")}>
              <Text style={styles.modalItemText}>{t("admin.dealForm.takePhoto")}</Text>
              <MaterialCommunityIcons name="camera" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCategoryModal} transparent animationType="fade" onRequestClose={() => setShowCategoryModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCategoryModal(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t("admin.dealForm.selectCategory")}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.modalItem}
                  onPress={() => {
                    setFormData((p) => ({ ...p, categoryId: c.id }));
                    setShowCategoryModal(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{c.name}</Text>
                  {formData.categoryId === c.id ? (
                    <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showAddonsModal} transparent animationType="slide" onRequestClose={() => setShowAddonsModal(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setShowAddonsModal(false)}>
          <View />
        </Pressable>
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandleContainer}>
            <View style={styles.sheetHandle} />
          </View>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderLeft}>
              <MaterialCommunityIcons name="plus-box-multiple" size={20} color="#ec4899" />
              <Text style={styles.sheetHeaderTitle}>{t("admin.dealForm.addons")}</Text>
            </View>
            {(formData.addOnIds?.length || 0) > 0 && (
              <View style={styles.sheetBadge}>
                <Text style={styles.sheetBadgeText}>{formData.addOnIds?.length} selected</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setShowAddonsModal(false)} style={styles.sheetCloseButton}>
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetSearchContainer}>
            <MaterialCommunityIcons name="magnify" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.sheetSearchInput}
              placeholder={t("admin.dealForm.searchAddons")}
              placeholderTextColor="#6B7280"
              value={addonSearchTerm}
              onChangeText={setAddonSearchTerm}
            />
          </View>
          <ScrollView style={styles.sheetScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.sheetItemList}>
              {filteredAddons.map((a) => {
                const isSelected = formData.addOnIds?.includes(a.id);
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.sheetSelectItem, isSelected && styles.sheetSelectItemSelected]}
                    onPress={() => toggleAddon(a.id)}
                  >
                    <View style={styles.sheetSelectItemInfo}>
                      <Text style={styles.sheetSelectItemName}>{a.name}</Text>
                    </View>
                    {isSelected ? (
                      <View style={styles.sheetCheckmark}>
                        <MaterialCommunityIcons name="check" size={16} color="#fff" />
                      </View>
                    ) : (
                      <View style={styles.sheetUnchecked} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={showDeclarationsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeclarationsModal(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowDeclarationsModal(false)}>
          <View />
        </Pressable>
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandleContainer}>
            <View style={styles.sheetHandle} />
          </View>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderLeft}>
              <MaterialCommunityIcons name="tag-multiple" size={20} color="#ec4899" />
              <Text style={styles.sheetHeaderTitle}>{t("admin.dealForm.declarations")}</Text>
            </View>
            {(formData.declarationIds?.length || 0) > 0 && (
              <View style={styles.sheetBadge}>
                <Text style={styles.sheetBadgeText}>{formData.declarationIds?.length} selected</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setShowDeclarationsModal(false)} style={styles.sheetCloseButton}>
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetSearchContainer}>
            <MaterialCommunityIcons name="magnify" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.sheetSearchInput}
              placeholder={t("admin.dealForm.searchDeclarations")}
              placeholderTextColor="#6B7280"
              value={declarationSearchTerm}
              onChangeText={setDeclarationSearchTerm}
            />
          </View>
          <ScrollView style={styles.sheetScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.sheetItemList}>
              {filteredDeclarations.map((d) => {
                const isSelected = formData.declarationIds?.includes(d.id);
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.sheetSelectItem, isSelected && styles.sheetSelectItemSelected]}
                    onPress={() => toggleDeclaration(d.id)}
                  >
                    <View style={styles.sheetSelectItemInfo}>
                      <Text style={styles.sheetSelectItemName}>{d.name}</Text>
                      {d.type && <Text style={styles.sheetSelectItemDesc}>{d.type}</Text>}
                    </View>
                    {isSelected ? (
                      <View style={styles.sheetCheckmark}>
                        <MaterialCommunityIcons name="check" size={16} color="#fff" />
                      </View>
                    ) : (
                      <View style={styles.sheetUnchecked} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={showOptionalIngredientsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOptionalIngredientsModal(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowOptionalIngredientsModal(false)}>
          <View />
        </Pressable>
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandleContainer}>
            <View style={styles.sheetHandle} />
          </View>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderLeft}>
              <MaterialCommunityIcons name="food-variant" size={20} color="#ec4899" />
              <Text style={styles.sheetHeaderTitle}>{t("admin.dealForm.optionalIngredients")}</Text>
            </View>
            {(formData.optionalIngredientIds?.length || 0) > 0 && (
              <View style={styles.sheetBadge}>
                <Text style={styles.sheetBadgeText}>{formData.optionalIngredientIds?.length} selected</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setShowOptionalIngredientsModal(false)} style={styles.sheetCloseButton}>
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetSearchContainer}>
            <MaterialCommunityIcons name="magnify" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.sheetSearchInput}
              placeholder={t("admin.dealForm.searchOptionalIngredients")}
              placeholderTextColor="#6B7280"
              value={optionalIngredientSearchTerm}
              onChangeText={setOptionalIngredientSearchTerm}
            />
          </View>
          <ScrollView style={styles.sheetScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.sheetItemList}>
              {filteredOptionalIngredients.map((o) => {
                const isSelected = formData.optionalIngredientIds?.includes(o.id);
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={[styles.sheetSelectItem, isSelected && styles.sheetSelectItemSelected]}
                    onPress={() => toggleOptionalIngredient(o.id)}
                  >
                    <View style={styles.sheetSelectItemInfo}>
                      <Text style={styles.sheetSelectItemName}>{o.name}</Text>
                      {o.description && <Text style={styles.sheetSelectItemDesc} numberOfLines={1}>{o.description}</Text>}
                    </View>
                    {isSelected ? (
                      <View style={styles.sheetCheckmark}>
                        <MaterialCommunityIcons name="check" size={16} color="#fff" />
                      </View>
                    ) : (
                      <View style={styles.sheetUnchecked} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#6b7280",
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    gap: 10,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#111827",
    fontSize: 14,
  },
  label: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700",
  },
  labelSmall: {
    color: "#6b7280",
    fontSize: 11,
  },
  helperText: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 16,
  },
  branchesLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  branchesLoadingText: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "600",
  },
  branchesEmptyContainer: {
    paddingVertical: 8,
  },
  branchesEmptyText: {
    color: "#6b7280",
    fontSize: 13,
  },
  branchesContainer: {
    gap: 10,
  },
  branchOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  branchOptionSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236,72,153,0.08)",
  },
  branchOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  branchCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  branchCheckboxSelected: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  branchOptionText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  branchOptionTextSelected: {
    color: "#111827",
  },
  excludedBranchesSummary: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(236,72,153,0.12)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.25)",
  },
  excludedBranchesSummaryText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  textarea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLeft: {
    flex: 1,
    gap: 4,
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectButtonText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    paddingRight: 10,
  },
  imagePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  imagePickerButtonText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  componentCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 10,
  },
  componentTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "800",
  },
  twoColRow: {
    flexDirection: "row",
    gap: 10,
  },
  twoCol: {
    flex: 1,
    gap: 6,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ec4899",
    paddingVertical: 14,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 16,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalItem: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  modalItemText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    paddingRight: 10,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.7,
    paddingBottom: 24,
  },
  sheetHandleContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#d1d5db",
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  sheetHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  sheetHeaderTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  sheetCloseButton: {
    padding: 8,
    marginLeft: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
  },
  sheetBadge: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sheetBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  sheetSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    gap: 10,
  },
  sheetSearchInput: {
    flex: 1,
    color: "#111827",
    fontSize: 15,
  },
  sheetScrollContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetItemList: {
    gap: 10,
    paddingBottom: 16,
  },
  sheetSelectItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  sheetSelectItemSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  sheetSelectItemInfo: {
    flex: 1,
  },
  sheetSelectItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  sheetSelectItemDesc: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },
  sheetCheckmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  sheetUnchecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchInput: {
    flex: 1,
    color: "#111827",
    fontSize: 14,
  },
});
