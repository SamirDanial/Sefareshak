// PayPal Configuration
// Note: Using sandbox credentials for development
// Update to production credentials when ready

export const PAYPAL_CONFIG = {
  clientId: process.env.PAYPAL_CLIENT_ID || "",
  clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
  mode: process.env.PAYPAL_MODE || "sandbox", // 'sandbox' or 'live'
  sandboxUrl: "https://api-m.sandbox.paypal.com",
  liveUrl: "https://api-m.paypal.com",
};

if (!PAYPAL_CONFIG.clientId) {
  console.warn(
    "PAYPAL_CLIENT_ID is not defined in environment variables - PayPal payments will be disabled"
  );
}

if (!PAYPAL_CONFIG.clientSecret) {
  console.warn(
    "PAYPAL_CLIENT_SECRET is not defined in environment variables - PayPal payments will be disabled"
  );
}

export const getPayPalBaseUrl = () => {
  return PAYPAL_CONFIG.mode === "live"
    ? PAYPAL_CONFIG.liveUrl
    : PAYPAL_CONFIG.sandboxUrl;
};





