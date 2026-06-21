import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-expo";
import ApiService from "../services/apiService";

interface AuthContextType {
  userId: string | null;
  userType: string | null;
  isLoading: boolean;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, user, isLoaded } = useUser();
  const { getToken } = useClerkAuth();
  const apiService = ApiService.getInstance();
  const [userType, setUserType] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch userType and userId when signed in
  useEffect(() => {
    if (isSignedIn && user && isLoaded) {
      const fetchUserData = async () => {
        try {
          const token = await getToken();
          if (token) {
            // Ensure user is registered in the backend DB (covers email/phone sign-ups)
            const primaryEmail = user.emailAddresses?.[0]?.emailAddress || "";
            const primaryPhone = user.phoneNumbers?.[0]?.phoneNumber || undefined;
            // Only register if we have at least an email or phone to identify the user
            if (primaryEmail || primaryPhone) {
              try {
                await apiService.registerUser({
                  clerkId: user.id,
                  email: primaryEmail,
                  firstName: user.firstName || undefined,
                  lastName: user.lastName || undefined,
                  phone: primaryPhone,
                });
              } catch (regError) {
                // Non-fatal: user may already exist or email may be missing for phone-only users
                console.warn("registerUser skipped:", regError);
              }
            }

            const result = await apiService.getUserProfile(token);
            if (result.success && result.data) {
              // Set user ID from profile
              setUserId(result.data.id || null);
              
              const nextUserType = (result.data.userType as string | undefined) || null;
              if (nextUserType) {
                setUserType(nextUserType);
              } else {
                const legacyRole = (result.data.role as string | undefined) || null;
                setUserType(legacyRole === "ADMIN" ? "SUPER_ADMIN" : legacyRole === "USER" ? "USER" : null);
              }
            }
          }
        } catch (error) {
          console.error("Failed to fetch user data:", error);
          setUserType(null);
          setUserId(null);
        }
      };

      fetchUserData();
    } else {
      setUserType(null);
      setUserId(null);
    }
  }, [isSignedIn, user, isLoaded, apiService, getToken]);

  const value: AuthContextType = {
    userId,
    userType,
    isLoading: !isLoaded,
    getToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthRole() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthRole must be used within an AuthProvider");
  }
  return context;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
