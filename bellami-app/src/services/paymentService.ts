import ApiService from "./apiService";

export interface PaymentIntentData {
  amount: number;
  currency?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResponse {
  success: boolean;
  data?: {
    clientSecret: string;
    paymentIntentId: string;
  };
  error?: string;
}

export interface ConfirmPaymentData {
  paymentIntentId: string;
  orderData?: {
    orderNumber?: string;
    deliveryAddress?: string;
    deliveryBuilding?: string;
    deliveryFloor?: string;
    deliveryApartment?: string;
    deliveryExtraDetails?: string;
    deliveryPhone?: string;
    deliveryNotes?: string;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    subtotal?: number;
    deliveryFee?: number;
    tax?: number;
    totalAmount?: number;
    branchId?: string;
  };
  cartItems?: any[];
  mergeWithOrderId?: string;
}

export interface ConfirmPaymentResponse {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}

export interface PayPalOrderData {
  amount: number;
  currency?: string;
  metadata?: Record<string, string>;
}

export interface PayPalOrderResponse {
  success: boolean;
  data?: {
    orderId: string;
    status: string;
  };
  error?: string;
}

export interface CapturePayPalOrderData {
  orderId: string;
  orderData?: {
    orderNumber?: string;
    deliveryAddress?: string;
    deliveryBuilding?: string;
    deliveryFloor?: string;
    deliveryApartment?: string;
    deliveryExtraDetails?: string;
    deliveryPhone?: string;
    deliveryNotes?: string;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    subtotal?: number;
    deliveryFee?: number;
    tax?: number;
    totalAmount?: number;
    branchId?: string;
  };
  cartItems?: any[];
  mergeWithOrderId?: string;
}

export interface CapturePayPalOrderResponse {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}

export class PaymentService {
  private apiService: ApiService;

  constructor(apiService: ApiService) {
    this.apiService = apiService;
  }

  async createPaymentIntent(
    token: string,
    data: PaymentIntentData
  ): Promise<PaymentIntentResponse> {
    try {
      const response = await fetch(
        `${this.apiService.getBaseUrl()}/api/payment/create-payment-intent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error creating payment intent:", error);
      return {
        success: false,
        error: "Failed to create payment intent",
      };
    }
  }

  async confirmPayment(
    token: string,
    data: ConfirmPaymentData
  ): Promise<ConfirmPaymentResponse> {
    try {
      const response = await fetch(
        `${this.apiService.getBaseUrl()}/api/payment/confirm-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error confirming payment:", error);
      return {
        success: false,
        error: "Failed to confirm payment",
      };
    }
  }

  async createPayPalOrder(
    token: string,
    data: PayPalOrderData
  ): Promise<PayPalOrderResponse> {
    try {
      const response = await fetch(
        `${this.apiService.getBaseUrl()}/api/payment/paypal/create-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error creating PayPal order:", error);
      return {
        success: false,
        error: "Failed to create PayPal order",
      };
    }
  }

  async capturePayPalOrder(
    token: string,
    data: CapturePayPalOrderData
  ): Promise<CapturePayPalOrderResponse> {
    try {
      const response = await fetch(
        `${this.apiService.getBaseUrl()}/api/payment/paypal/capture-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error capturing PayPal order:", error);
      return {
        success: false,
        error: "Failed to capture PayPal order",
      };
    }
  }
}

