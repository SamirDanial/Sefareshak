import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { PaymentService } from "@/services/paymentService";
import ApiService from "@/services/apiService";
import { toast } from "sonner";
import { formatPrice } from "@/utils/currency";
import { useTranslation } from "react-i18next";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

interface PaymentFormProps {
  amount: number;
  currency?: string;
  onSuccess?: (paymentIntentId: string) => void;
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
  skipOrderCreation?: boolean; // If true, skip calling confirmPayment (for reservations)
  buttonClassName?: string; // Custom className for the button
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  amount,
  currency = "usd",
  onSuccess,
  onError,
  orderData,
  cartItems,
  mergeWithOrderId,
  disabled = false,
  buttonText,
  skipOrderCreation = false,
  buttonClassName,
}) => {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const { getToken } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentService] = useState(
    () => new PaymentService(ApiService.getInstance())
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      // Get authentication token from Clerk
      const token = await getToken();

      if (!token) {
        throw new Error("Authentication token not found");
      }

      // Create payment intent
      const paymentIntentResult = await paymentService.createPaymentIntent(
        token,
        {
          amount,
          currency,
          branchId: orderData?.branchId,
          metadata: {
            orderNumber: orderData?.orderNumber || "",
            branchId: orderData?.branchId || "",
          },
        }
      );

      if (!paymentIntentResult.success || !paymentIntentResult.data) {
        throw new Error(
          paymentIntentResult.error || "Failed to create payment intent"
        );
      }

      const { clientSecret } = paymentIntentResult.data;

      // Confirm payment with Stripe
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: elements.getElement(CardNumberElement) as any,
          },
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (paymentIntent?.status === "succeeded") {
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
          onSuccess?.(paymentIntent.id);
        } else {
          // Confirm payment on backend (creates order)
          const confirmResult = await paymentService.confirmPayment(token, {
            paymentIntentId: paymentIntent.id,
            orderData,
            cartItems,
            mergeWithOrderId,
          });

          if (confirmResult.success) {
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
            onSuccess?.(paymentIntent.id);
          } else {
            throw new Error(confirmResult.error || "Failed to confirm payment");
          }
        }
      }
    } catch (error) {
      console.error("Payment error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Payment failed";
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
    } finally {
      setIsProcessing(false);
    }
  };

  const cardElementOptions = {
    hidePostalCode: true,
    style: {
      base: {
        color: "white",
      },
    },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <label className="text-sm font-medium text-foreground">
          Card Details
        </label>

        {/* Card Number */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Card Number</label>
          <div className="p-3 border border-border rounded-lg bg-card stripe-element-container">
            <CardNumberElement options={cardElementOptions} />
          </div>
        </div>

        {/* Expiry and CVC */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Expiry Date</label>
            <div className="p-3 border border-border rounded-lg bg-card stripe-element-container">
              <CardExpiryElement options={cardElementOptions} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">CVC</label>
            <div className="p-3 border border-border rounded-lg bg-card stripe-element-container">
              <CardCvcElement options={cardElementOptions} />
            </div>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        disabled={!stripe || isProcessing || disabled}
        className={`w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400 focus-visible:ring-2 focus-visible:ring-rose-400 ${buttonClassName || ""}`}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing Payment...
          </span>
        ) : (
          buttonText || t("checkout.step2.pay", { amount: formatPrice(amount, currency) })
        )}
      </Button>
    </form>
  );
};

const StripePaymentForm: React.FC<PaymentFormProps> = (props) => {
  return (
    <Elements stripe={stripePromise}>
      <PaymentForm {...props} />
    </Elements>
  );
};

export default StripePaymentForm;
