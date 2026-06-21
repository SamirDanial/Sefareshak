import React, { useState } from "react";
import { PayPalButtons, PayPalScriptProvider, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { useAuth } from "@clerk/clerk-react";
import { PaymentService } from "@/services/paymentService";
import ApiService from "@/services/apiService";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || "";

interface PayPalPaymentFormProps {
  amount: number;
  currency?: string;
  onSuccess?: (orderId: string) => void;
  onError?: (error: string) => void;
  orderData?: {
    orderType?: "DELIVERY" | "PICKUP";
    orderNumber?: string;
    deliveryAddress?: string;
    deliveryStreetAddress?: string;
    deliveryHouseNumber?: string;
    deliveryPostalCode?: string;
    deliveryBuilding?: string;
    deliveryFloor?: string;
    deliveryApartment?: string;
    deliveryExtraDetails?: string;
    deliveryPhone?: string;
    deliveryNotes?: string;
    pickupPhone?: string;
    pickupNotes?: string;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    subtotal?: number;
    deliveryFee?: number;
    tax?: number;
    totalAmount?: number;
    deliveryDistanceKm?: number;
    branchId?: string;
    scheduledDate?: string;
    replacesOrderId?: string;
    depositPercentage?: number;
    payableAmount?: number;
  };
  cartItems?: any[];
  mergeWithOrderId?: string;
  disabled?: boolean;
  buttonText?: string;
  skipOrderCreation?: boolean;
}

const PayPalButtonWrapper: React.FC<PayPalPaymentFormProps> = ({
  amount,
  currency = "USD",
  onSuccess,
  onError,
  orderData,
  cartItems,
  mergeWithOrderId,
  disabled = false,
  skipOrderCreation = false,
}) => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const [paymentService] = useState(() => new PaymentService(ApiService.getInstance()));
  const [{ isPending }] = usePayPalScriptReducer();

  const createPayPalOrder = async (_data: any, actions: any): Promise<string> => {
    try {
      // Use PayPal's CLIENT-SIDE order creation for inline checkout
      // This is the key to preventing redirects - client-side order creation uses popup/modal
      // The 'actions' parameter is provided by PayPal SDK and contains the order.create method
      if (!actions || !actions.order) {
        throw new Error("PayPal SDK not ready");
      }

      // Create order directly using PayPal's client-side API
      // This ensures inline checkout (popup/modal) instead of redirect
      const orderId = await actions.order.create({
        purchase_units: [
          {
            amount: {
              currency_code: currency.toUpperCase(),
              value: amount.toFixed(2),
            },
            description: `Order payment - ${orderData?.orderNumber || "N/A"}`,
            custom_id: orderData?.orderNumber || `order-${Date.now()}`,
          },
        ],
        application_context: {
          brand_name: orderData?.guestName || "Restaurant Order",
          landing_page: "NO_PREFERENCE",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          // DO NOT include return_url or cancel_url - this forces redirect
        },
      });

      // Validate the order on our server (for security and tracking) - non-blocking
      const token = await getToken();
      if (token) {
        try {
          // Create order on our server for tracking (non-blocking)
          paymentService.createPayPalOrder(token, {
            amount,
            currency,
            branchId: orderData?.branchId,
            metadata: {
              orderNumber: orderData?.orderNumber || "",
              businessName: orderData?.guestName || "Restaurant Order",
              paypalOrderId: orderId, // Store PayPal order ID
              branchId: orderData?.branchId || "",
            },
          }).catch((err) => {
            console.warn("Failed to create server-side order tracking:", err);
            // Non-blocking - continue with payment
          });
        } catch (err) {
          console.warn("Error creating server-side order tracking:", err);
          // Non-blocking - continue with payment
        }
      }

      return orderId;
    } catch (error) {
      console.error("Error creating PayPal order:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create PayPal order";
      toast.error(errorMessage, {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
        },
      });
      onError?.(errorMessage);
      throw error;
    }
  };

  const onApprove = async (data: { orderID: string }): Promise<void> => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Authentication token not found");
      }

      // For reservations, skip order creation - the reservation endpoint handles it
      if (skipOrderCreation) {
        toast.success(t("checkout.step2.paymentSuccessfulOrderConfirmed"), {
          duration: 4000,
          style: {
            background: "rgba(34, 197, 94, 0.9)",
            color: "#ffffff",
            border: "1px solid rgba(34, 197, 94, 0.5)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
          },
        });
        onSuccess?.(data.orderID);
        return;
      }

      // Capture payment and create order
      const captureResult = await paymentService.capturePayPalOrder(token, {
        orderId: data.orderID,
        orderData,
        cartItems,
        mergeWithOrderId,
      });

      if (captureResult.success) {
        toast.success(t("checkout.step2.paymentSuccessfulOrderConfirmed"), {
          duration: 4000,
          style: {
            background: "rgba(34, 197, 94, 0.9)",
            color: "#ffffff",
            border: "1px solid rgba(34, 197, 94, 0.5)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
          },
        });
        onSuccess?.(data.orderID);
      } else {
        throw new Error(captureResult.error || "Failed to capture PayPal payment");
      }
    } catch (error) {
      console.error("Error capturing PayPal payment:", error);
      const errorMessage = error instanceof Error ? error.message : "Payment failed";
      toast.error(errorMessage, {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
        },
      });
      onError?.(errorMessage);
    }
  };

  const handlePayPalError = (err: any) => {
    console.error("PayPal error:", err);
    const errorMessage = "PayPal payment failed. Please try again.";
    toast.error(errorMessage, {
      duration: 4000,
      style: {
        background: "rgba(239, 68, 68, 0.9)",
        color: "#ffffff",
        border: "1px solid rgba(239, 68, 68, 0.5)",
        borderRadius: "12px",
        boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
      },
    });
    onError?.(errorMessage);
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400">
        {t("checkout.step2.paymentDisabled")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PayPalButtons
        createOrder={createPayPalOrder}
        onApprove={onApprove}
        onError={handlePayPalError}
        onCancel={() => {
          onError?.("Payment was cancelled");
        }}
        style={{
          layout: "vertical",
          color: "blue",
          shape: "rect",
          label: "paypal",
        }}
        disabled={disabled}
        forceReRender={[amount, currency]}
        fundingSource="paypal"
      />
    </div>
  );
};

const PayPalPaymentForm: React.FC<PayPalPaymentFormProps> = (props) => {
  if (!PAYPAL_CLIENT_ID) {
    return (
      <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-sm text-red-800 dark:text-red-200">
          PayPal is not configured. Please contact support.
        </p>
      </div>
    );
  }

  return (
    <PayPalScriptProvider
      options={{
        clientId: PAYPAL_CLIENT_ID, // React SDK uses camelCase (TypeScript requirement)
        currency: props.currency?.toUpperCase() || "USD",
        intent: "capture",
        components: "buttons",
        enableFunding: "paylater,venmo",
        disableFunding: "card", // Disable card payment option - only show PayPal
      }}
    >
      <PayPalButtonWrapper {...props} />
    </PayPalScriptProvider>
  );
};

export default PayPalPaymentForm;

