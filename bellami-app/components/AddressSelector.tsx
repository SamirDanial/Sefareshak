import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
  Animated,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import ApiService from "@/src/services/apiService";
import { Toast } from "./Toast";

interface Address {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
}

interface AddressSelectorProps {
  selectedAddress: string;
  onAddressSelect: (address: string) => void;
}

export function AddressSelector({
  selectedAddress,
  onAddressSelect,
}: AddressSelectorProps) {
  const { getToken } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newAddress, setNewAddress] = useState({
    label: "",
    street: "",
    city: "",
    state: "",
    zipCode: "",
    isDefault: false,
  });
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Toast state
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
    loadAddresses();

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

  const loadAddresses = async () => {
    try {
      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      // Fetch addresses from user profile
      const result = await ApiService.getInstance().getUserProfile(token);

      if (result.success && result.data?.addresses) {
        setAddresses(result.data.addresses);

        // Auto-select default address
        const defaultAddr = result.data.addresses.find(
          (a: Address) => a.isDefault
        );
        if (defaultAddr) {
          const fullAddress = `${defaultAddr.street}, ${defaultAddr.city}, ${defaultAddr.state} ${defaultAddr.zipCode}`;
          setSelectedId(defaultAddr.id);
          onAddressSelect(fullAddress);
        }
      }
    } catch (error) {
      console.error("Failed to load addresses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAddress = (address: Address) => {
    const fullAddress = `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`;
    setSelectedId(address.id);
    onAddressSelect(fullAddress);
  };

  const handleAddAddress = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      // Validate and show specific error message
      if (!newAddress.label) {
        setToast({
          visible: true,
          message: "Please enter a label (e.g., Home, Work)",
          type: "error",
        });
        return;
      }
      if (!newAddress.street) {
        setToast({
          visible: true,
          message: "Please enter the street address",
          type: "error",
        });
        return;
      }
      if (!newAddress.city) {
        setToast({
          visible: true,
          message: "Please enter the city",
          type: "error",
        });
        return;
      }
      if (!newAddress.state) {
        setToast({
          visible: true,
          message: "Please enter the state",
          type: "error",
        });
        return;
      }
      if (!newAddress.zipCode) {
        setToast({
          visible: true,
          message: "Please enter the ZIP code",
          type: "error",
        });
        return;
      }

      // Update profile with new address
      const result = await ApiService.getInstance().getUserProfile(token);
      if (result.success && result.data) {
        const updatedAddresses = [
          ...(result.data.addresses || []),
          {
            id: Date.now().toString(),
            ...newAddress,
            isDefault: result.data.addresses?.length === 0,
          },
        ];

        await ApiService.getInstance().updateProfile(token, {
          ...result.data,
          addresses: updatedAddresses,
        });

        setNewAddress({
          label: "",
          street: "",
          city: "",
          state: "",
          zipCode: "",
          isDefault: false,
        });
        setShowModal(false);
        loadAddresses();
        setToast({
          visible: true,
          message: "Address added successfully!",
          type: "success",
        });
      }
    } catch (error) {
      console.error("Failed to add address:", error);
      setToast({
        visible: true,
        message: "Failed to add address",
        type: "error",
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📍 Delivery Address</Text>
        <ActivityIndicator
          size="small"
          color="#ec4899"
          style={{ marginVertical: 20 }}
        />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>📍 Delivery Address</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowModal(true)}
        >
          <Text style={styles.addButtonText}>+ Add New</Text>
        </TouchableOpacity>
      </View>

      {addresses.length > 0 ? (
        <View style={styles.addressList}>
          {addresses.map((address) => (
            <TouchableOpacity
              key={address.id}
              style={[
                styles.addressOption,
                selectedId === address.id && styles.addressOptionSelected,
              ]}
              onPress={() => handleSelectAddress(address)}
            >
              <View style={styles.radioButton}>
                {selectedId === address.id && (
                  <View style={styles.radioSelected} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.addressHeader}>
                  <Text style={styles.addressLabel}>{address.label}</Text>
                  {address.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.addressText}>
                  {address.street}, {address.city}, {address.state}{" "}
                  {address.zipCode}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📦</Text>
          <Text style={styles.emptyText}>No saved addresses found</Text>
          <Text style={styles.emptySubtext}>Add your first address</Text>
        </View>
      )}

      {/* Add Address Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <Pressable
          style={styles.modalContainer}
          onPress={() => setShowModal(false)}
        >
          <View
            style={[
              styles.modalContent,
              { marginBottom: keyboardHeight > 0 ? keyboardHeight : 0 },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Address</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <TextInput
                style={styles.modalInput}
                placeholder="Label (e.g., Home, Work)"
                placeholderTextColor="#9BA1A6"
                value={newAddress.label}
                onChangeText={(text) =>
                  setNewAddress({ ...newAddress, label: text })
                }
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Street Address"
                placeholderTextColor="#9BA1A6"
                value={newAddress.street}
                onChangeText={(text) =>
                  setNewAddress({ ...newAddress, street: text })
                }
              />
              <TextInput
                style={styles.modalInput}
                placeholder="City"
                placeholderTextColor="#9BA1A6"
                value={newAddress.city}
                onChangeText={(text) =>
                  setNewAddress({ ...newAddress, city: text })
                }
              />
              <View style={styles.row}>
                <TextInput
                  style={[styles.modalInput, { flex: 1, marginRight: 8 }]}
                  placeholder="State"
                  placeholderTextColor="#9BA1A6"
                  value={newAddress.state}
                  onChangeText={(text) =>
                    setNewAddress({ ...newAddress, state: text })
                  }
                />
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  placeholder="ZIP"
                  placeholderTextColor="#9BA1A6"
                  value={newAddress.zipCode}
                  onChangeText={(text) =>
                    setNewAddress({ ...newAddress, zipCode: text })
                  }
                  keyboardType="numeric"
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAddAddress}
              >
                <Text style={styles.saveButtonText}>Add Address</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#262626",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  addButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  addressList: {
    marginBottom: 16,
  },
  addressOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  addressOptionSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#9BA1A6",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  radioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ec4899",
  },
  addressHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  addressLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginRight: 8,
  },
  defaultBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    color: "#22c55e",
    fontSize: 11,
    fontWeight: "600",
  },
  addressText: {
    fontSize: 13,
    color: "#9BA1A6",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: "#fff",
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: "#9BA1A6",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#333",
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: "#9BA1A6",
  },
  input: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#fff",
    marginBottom: 12,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#151718",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  modalClose: {
    fontSize: 24,
    color: "#9BA1A6",
  },
  modalScroll: {
    maxHeight: 400,
    marginBottom: 10,
  },
  modalInput: {
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    marginBottom: 12,
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#333",
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
