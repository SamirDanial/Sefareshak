import React, { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Icon from "@mdi/react";
import { mdiMapMarker, mdiPlus } from "@mdi/js";
import ApiService from "@/services/apiService";
import { toast } from "sonner";

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
  onAddressChange: (address: string) => void;
}

const AddressSelector: React.FC<AddressSelectorProps> = ({
  selectedAddress,
  onAddressSelect,
  onAddressChange,
}) => {
  const { getToken } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [newAddress, setNewAddress] = useState({
    label: "",
    street: "",
    city: "",
    state: "",
    zipCode: "",
    isDefault: false,
  });

  // Load user addresses
  useEffect(() => {
    loadAddresses();
  }, []);

  const loadAddresses = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();
      const result = await apiService.getUserAddresses(token);

      if (result.success) {
        setAddresses(result.data || []);
        // Auto-select default address if available
        const defaultAddress = result.data?.find(
          (addr: Address) => addr.isDefault
        );
        if (defaultAddress && !selectedAddress) {
          const fullAddress = `${defaultAddress.street}, ${defaultAddress.city}, ${defaultAddress.state} ${defaultAddress.zipCode}`;
          setSelectedAddressId(defaultAddress.id);
          onAddressSelect(fullAddress);
        }
      }
    } catch (error) {
      console.error("Failed to load addresses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddressSelect = (addressId: string) => {
    const address = addresses.find((addr) => addr.id === addressId);
    if (address) {
      const fullAddress = `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`;
      setSelectedAddressId(addressId);
      onAddressSelect(fullAddress);
    }
  };

  const handleManualAddressChange = (address: string) => {
    setSelectedAddressId(""); // Clear radio selection when typing manually
    onAddressChange(address);
  };

  const handleAddAddress = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      // Validate required fields
      if (
        !newAddress.label ||
        !newAddress.street ||
        !newAddress.city ||
        !newAddress.state ||
        !newAddress.zipCode
      ) {
        toast.error("Please fill in all address fields");
        return;
      }

      const apiService = ApiService.getInstance();
      const result = await apiService.addAddress(token, newAddress);

      if (result.success) {
        toast.success("Address added successfully!");
        setNewAddress({
          label: "",
          street: "",
          city: "",
          state: "",
          zipCode: "",
          isDefault: false,
        });
        setIsDialogOpen(false);
        loadAddresses(); // Reload addresses
      } else {
        toast.error(result.error || "Failed to add address");
      }
    } catch (error) {
      console.error("Failed to add address:", error);
      toast.error("Failed to add address");
    }
  };

  const formatAddress = (address: Address) => {
    return `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon path={mdiMapMarker} size={0.83} />
            Delivery Address <span className="text-red-500">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon path={mdiMapMarker} size={0.83} />
            Delivery Address <span className="text-red-500">*</span>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Icon path={mdiPlus} size={0.67} />
                Add New
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md bg-background text-foreground">
              <DialogHeader>
                <DialogTitle className="text-foreground">
                  Add New Address
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="label" className="text-foreground">
                    Label (e.g., Home, Work)
                  </Label>
                  <Input
                    id="label"
                    placeholder="Home"
                    value={newAddress.label}
                    onChange={(e) =>
                      setNewAddress((prev) => ({
                        ...prev,
                        label: e.target.value,
                      }))
                    }
                    className="mt-1 bg-background text-foreground border-border"
                  />
                </div>
                <div>
                  <Label htmlFor="street" className="text-foreground">
                    Street Address
                  </Label>
                  <Input
                    id="street"
                    placeholder="123 Main St"
                    value={newAddress.street}
                    onChange={(e) =>
                      setNewAddress((prev) => ({
                        ...prev,
                        street: e.target.value,
                      }))
                    }
                    className="mt-1 bg-background text-foreground border-border"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="city" className="text-foreground">
                      City
                    </Label>
                    <Input
                      id="city"
                      placeholder="New York"
                      value={newAddress.city}
                      onChange={(e) =>
                        setNewAddress((prev) => ({
                          ...prev,
                          city: e.target.value,
                        }))
                      }
                      className="mt-1 bg-background text-foreground border-border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="state" className="text-foreground">
                      State
                    </Label>
                    <Input
                      id="state"
                      placeholder="NY"
                      value={newAddress.state}
                      onChange={(e) =>
                        setNewAddress((prev) => ({
                          ...prev,
                          state: e.target.value,
                        }))
                      }
                      className="mt-1 bg-background text-foreground border-border"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="zipCode" className="text-foreground">
                    ZIP Code
                  </Label>
                  <Input
                    id="zipCode"
                    placeholder="10001"
                    value={newAddress.zipCode}
                    onChange={(e) =>
                      setNewAddress((prev) => ({
                        ...prev,
                        zipCode: e.target.value,
                      }))
                    }
                    className="mt-1 bg-background text-foreground border-border"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={newAddress.isDefault}
                    onChange={(e) =>
                      setNewAddress((prev) => ({
                        ...prev,
                        isDefault: e.target.checked,
                      }))
                    }
                    className="rounded border-border bg-background text-primary focus:ring-primary"
                  />
                  <Label htmlFor="isDefault" className="text-foreground">
                    Set as default address
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleAddAddress}
                    className="flex-1 bg-pink-500 hover:bg-pink-600 text-white"
                  >
                    Add Address
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="border-border text-foreground hover:bg-muted"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {addresses.length > 0 ? (
          <RadioGroup
            value={selectedAddressId}
            onValueChange={handleAddressSelect}
          >
            <div className="space-y-3">
              {addresses.map((address) => (
                <div key={address.id} className="flex items-start space-x-3">
                  <RadioGroupItem value={address.id} id={address.id} />
                  <Label
                    htmlFor={address.id}
                    className="flex-1 cursor-pointer space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{address.label}</span>
                      {address.isDefault && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatAddress(address)}
                    </p>
                  </Label>
                </div>
              ))}
            </div>
          </RadioGroup>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Icon path={mdiMapMarker} size={2} className="mx-auto mb-4 opacity-50" />
            <p>No saved addresses found</p>
            <p className="text-sm">Add your first address to get started</p>
          </div>
        )}

        {/* Manual address input */}
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px bg-border flex-1"></div>
            <span className="text-sm text-muted-foreground">
              Or enter manually
            </span>
            <div className="h-px bg-border flex-1"></div>
          </div>
          <div>
            <Label htmlFor="manual-address">
              Delivery Address <span className="text-red-500">*</span>
            </Label>
            <Input
              id="manual-address"
              placeholder="Enter your delivery address"
              value={selectedAddress}
              onChange={(e) => handleManualAddressChange(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AddressSelector;
