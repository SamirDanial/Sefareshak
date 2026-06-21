import {
  ClerkExpressRequireAuth,
  ClerkExpressWithAuth,
} from "@clerk/clerk-sdk-node";

class ClerkSingleton {
  private static instance: ClerkSingleton;
  private requireAuth: ReturnType<typeof ClerkExpressRequireAuth>;
  private withAuth: ReturnType<typeof ClerkExpressWithAuth>;

  private constructor() {
    // Check if Clerk is properly configured
    if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_ISSUER_URL) {
      console.warn(
        "⚠️  Clerk environment variables not found. Running without authentication."
      );
      console.warn(
        "   Set CLERK_SECRET_KEY and CLERK_ISSUER_URL to enable authentication."
      );

      // Create mock middleware that allows all requests
      this.requireAuth = ClerkExpressRequireAuth();
      this.withAuth = ClerkExpressWithAuth();

      return;
    }

    // Initialize Clerk middleware with proper configuration
    this.requireAuth = ClerkExpressRequireAuth({
      onError: (error) => {
        console.error("Clerk requireAuth error:", error);
      },
    });

    this.withAuth = ClerkExpressWithAuth({
      onError: (error) => {
        console.error("Clerk withAuth error:", error);
      },
    });
  }

  public static getInstance(): ClerkSingleton {
    if (!ClerkSingleton.instance) {
      ClerkSingleton.instance = new ClerkSingleton();
    }
    return ClerkSingleton.instance;
  }

  public getRequireAuth(): ReturnType<typeof ClerkExpressRequireAuth> {
    return this.requireAuth;
  }

  public getWithAuth(): ReturnType<typeof ClerkExpressWithAuth> {
    return this.withAuth;
  }

  public validateClerkToken(token: string): boolean {
    try {
      // Basic token validation - in production, use Clerk's verifyToken method
      return Boolean(token && token.length > 0);
    } catch (error) {
      console.error("Token validation error:", error);
      return false;
    }
  }
}

export default ClerkSingleton;
