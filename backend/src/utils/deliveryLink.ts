import crypto from "crypto";

const getSecret = (): string | null => {
  const secret = process.env.DELIVERY_LINK_SECRET;
  if (secret && secret.length > 0) return secret;

  if (process.env.NODE_ENV !== "production") {
    return "dev_delivery_link_secret";
  }

  return null;
};

export const createDeliveryLinkToken = (orderId: string): string => {
  const secret = getSecret();
  if (!secret) {
    throw new Error("DELIVERY_LINK_SECRET is not configured");
  }

  return crypto.createHmac("sha256", secret).update(orderId).digest("hex");
};

export const verifyDeliveryLinkToken = (orderId: string, token: string): boolean => {
  try {
    const expected = createDeliveryLinkToken(orderId);
    if (!token || token.length !== expected.length) return false;

    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
};
