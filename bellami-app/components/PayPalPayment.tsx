import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
} from "react-native";
import { WebView as RNWebView } from "react-native-webview";
import { useTranslation } from "react-i18next";
import { MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";

const PAYPAL_CLIENT_ID = process.env.EXPO_PUBLIC_PAYPAL_CLIENT_ID || "";

interface PayPalPaymentProps {
  amount: number;
  currency?: string;
  onSuccess: (orderId: string) => void;
  onError: (error: string) => void;
  onCancel: () => void;
  orderData?: {
    orderNumber?: string;
    orderType?: "DELIVERY" | "PICKUP";
  };
  disabled?: boolean;
}

export default function PayPalPayment({
  amount,
  currency = "USD",
  onSuccess,
  onError,
  onCancel,
  orderData,
  disabled = false,
}: PayPalPaymentProps) {
  const { t } = useTranslation();
  const [showWebView, setShowWebView] = useState(false);
  const [loading, setLoading] = useState(false);
  const webViewRef = useRef<RNWebView>(null);

  const handlePayPalPayment = async () => {
    if (disabled) return;

    if (!PAYPAL_CLIENT_ID) {
      onError("PayPal is not configured. Please contact support.");
      return;
    }

    setLoading(true);
    setShowWebView(true);
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === "PAYPAL_SUCCESS") {
        setShowWebView(false);
        setLoading(false);
        onSuccess(data.orderId);
      } else if (data.type === "PAYPAL_ERROR") {
        setShowWebView(false);
        setLoading(false);
        onError(data.error || "Payment failed");
      } else if (data.type === "PAYPAL_CANCEL") {
        setShowWebView(false);
        setLoading(false);
        onCancel();
      }
    } catch (error) {
      console.error("Error parsing WebView message:", error);
      // If we can't parse the message, treat it as an error to prevent user being stuck
      setShowWebView(false);
      setLoading(false);
      onError("An error occurred during payment. Please try again.");
    }
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <script src="https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=${currency.toUpperCase()}&intent=capture"></script>
      <style>
        body {
          margin: 0;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f5f5f5;
        }
        #paypal-button-container {
          max-width: 500px;
          margin: 0 auto;
          padding-top: 20px;
        }
        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div id="paypal-button-container"></div>
      <div id="loading" class="loading">Loading PayPal...</div>
      
      <script>
        let orderId = null;
        
        paypal.Buttons({
          createOrder: function(data, actions) {
            return actions.order.create({
              purchase_units: [{
                amount: {
                  currency_code: "${currency.toUpperCase()}",
                  value: "${amount.toFixed(2)}"
                },
                description: "Order payment - ${orderData?.orderNumber || "N/A"}",
                custom_id: "${orderData?.orderNumber || `order-${Date.now()}`}"
              }],
              application_context: {
                brand_name: "Restaurant Order",
                landing_page: "NO_PREFERENCE",
                user_action: "PAY_NOW",
                shipping_preference: "NO_SHIPPING"
              }
            }).then(function(orderId) {
              window.orderId = orderId;
              document.getElementById('loading').style.display = 'none';
              return orderId;
            });
          },
          onApprove: function(data, actions) {
            return actions.order.capture().then(function(details) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'PAYPAL_SUCCESS',
                orderId: data.orderID
              }));
            });
          },
          onError: function(err) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PAYPAL_ERROR',
              error: err.message || 'Payment failed'
            }));
          },
          onCancel: function(data) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PAYPAL_CANCEL'
            }));
          }
        }).render('#paypal-button-container');
        
        // Hide loading after a timeout
        setTimeout(function() {
          document.getElementById('loading').style.display = 'none';
        }, 3000);
      </script>
    </body>
    </html>
  `;

  if (disabled) {
    return (
      <View style={styles.disabledContainer}>
        <Text style={styles.disabledText}>
          {t("checkout.step2.paymentDisabled", "Payment is disabled")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.paypalButton}
        onPress={handlePayPalPayment}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="account-balance-wallet" size={24} color="#fff" />
            <Text style={styles.paypalButtonText}>
              {t("checkout.step2.paypal", "Pay with PayPal")}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Modal
        visible={showWebView}
        animationType="slide"
        onRequestClose={() => {
          setShowWebView(false);
          setLoading(false);
          onCancel();
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {t("checkout.step2.paypal", "Pay with PayPal")}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowWebView(false);
                setLoading(false);
                onCancel();
              }}
              style={styles.closeButton}
            >
              <MaterialIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <RNWebView
            ref={webViewRef}
            source={{ html: htmlContent }}
            onMessage={handleWebViewMessage}
            style={styles.webView}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0070ba" />
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  disabledContainer: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  disabledText: {
    color: "#999",
    fontSize: 14,
  },
  paypalButton: {
    backgroundColor: "#0070ba",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  paypalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#0070ba",
    paddingTop: Constants.statusBarHeight + 16,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  webView: {
    flex: 1,
  },
  loadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
});

