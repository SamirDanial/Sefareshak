import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useUser, useClerk, useAuth as useClerkAuth } from "@clerk/clerk-react";
import ApiService from "../services/apiService";
import { PolicyConsentModal } from "../components/PolicyConsentModal";

interface AuthContextType {
  isSignedIn: boolean;
  user: any;
  userId: string | null;
  userRole: string | null;
  userType: string | null;
  orgRole: string | null;
  isLoading: boolean;
  signIn: () => void;
  signOut: () => void;
  openUserProfile: () => void;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Check if Clerk is available
  const clerkPublishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const isValidClerkKey =
    clerkPublishableKey &&
    clerkPublishableKey.startsWith("pk_") &&
    clerkPublishableKey !== "pk_test_your_publishable_key_here";

  // If Clerk is not available, provide mock auth context
  if (!isValidClerkKey) {
    const mockValue: AuthContextType = {
      isSignedIn: false,
      user: null,
      userId: null,
      userRole: null,
      userType: null,
      orgRole: null,
      isLoading: false,
      signIn: () => console.warn("Authentication not available"),
      signOut: () => console.warn("Authentication not available"),
      openUserProfile: () => console.warn("Authentication not available"),
      getToken: () => Promise.resolve(null),
    };
    return (
      <AuthContext.Provider value={mockValue}>{children}</AuthContext.Provider>
    );
  }

  const { isSignedIn, user, isLoaded } = useUser();
  const { openSignIn, openUserProfile, signOut } = useClerk();
  const { getToken } = useClerkAuth();
  const apiService = ApiService.getInstance();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);

  const API_BASE_URL =
    import.meta.env.VITE_API_URL ||
    (typeof window !== "undefined" ? "" : "http://localhost:3001");

  // Auto-register user when they sign in
  useEffect(() => {
    if (isSignedIn && user && isLoaded) {
      const registerUser = async () => {
        try {
          await apiService.registerUser({
            clerkId: user.id,
            email: user.emailAddresses[0]?.emailAddress || "",
            firstName: user.firstName || undefined,
            lastName: user.lastName || undefined,
            phone: user.phoneNumbers[0]?.phoneNumber || undefined,
          });
        } catch (error) {
          console.error("Failed to register user:", error);
        }
      };

      registerUser();
    }
  }, [isSignedIn, user, isLoaded, apiService]);

  // Fetch user role when signed in
  useEffect(() => {
    if (isSignedIn && user && isLoaded) {
      const fetchUserRole = async () => {
        try {
          setProfileLoading(true);
          const token = await getToken();
          if (token) {
            const result = await apiService.getUserProfile(token);
            if (result.success && result.data) {
              // Set user ID from profile
              setUserId(result.data.id || null);
              
              // Backward-compatible: map new RBAC userType to legacy userRole
              const userType = result.data.userType as string | undefined;
              setUserType(userType || null);
              const orgRole = (result.data as any).orgRole as string | undefined;
              setOrgRole(orgRole || null);
              if (
                (userType && userType !== "USER") ||
                orgRole === "ORG_OWNER" ||
                orgRole === "ORG_ADMIN"
              ) {
                setUserRole("ADMIN");
              } else {
                setUserRole("USER");
              }
            }
          }
        } catch (error) {
          console.error("Failed to fetch user role:", error);
        } finally {
          setProfileLoading(false);
        }
      };

      fetchUserRole();
    } else {
      setUserRole(null);
      setUserType(null);
      setOrgRole(null);
      setUserId(null);
      setProfileLoading(false);
    }
  }, [isSignedIn, user, isLoaded, apiService, getToken]);

  // Check user signature status after sign in and periodically
  useEffect(() => {
    if (isSignedIn && user && isLoaded) {
      const checkUserSignature = async () => {
        try {
          const token = await getToken();
          if (!token) {
            return;
          }

          const signatureResponse = await fetch(
            `${API_BASE_URL}/api/user/signature-status`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (signatureResponse.ok) {
            const signatureData = await signatureResponse.json();

            if (
              signatureData.success &&
              !signatureData.data.hasAcceptedRequiredPolicies
            ) {
              try {
                const policiesResponse = await fetch(
                  `${API_BASE_URL}/api/terms-and-policies/active/all?language=en`
                );

                if (policiesResponse.ok) {
                  const policiesData = await policiesResponse.json();

                  const requiredPolicies =
                    policiesData.success && policiesData.data
                      ? policiesData.data.filter(
                          (p: any) => p.isRequired === true
                        )
                      : [];

                  if (requiredPolicies.length > 0) {
                    setShowConsentModal(true);
                  }
                } else {
                  const errorText = await policiesResponse
                    .text()
                    .catch(() => "Unknown error");
                  console.error(
                    "❌ [AuthContext] Failed to fetch policies:",
                    policiesResponse.status,
                    errorText
                  );
                }
              } catch (fetchError) {
                console.error(
                  "❌ [AuthContext] Error fetching policies:",
                  fetchError
                );
              }
            } else {
              if (showConsentModal) {
                setShowConsentModal(false);
              }
            }
          } else {
            console.error(
              "❌ [AuthContext] Failed to fetch signature status:",
              signatureResponse.status
            );
          }
        } catch (error) {
          console.error(
            "❌ [AuthContext] Error checking user signature:",
            error
          );
        }
      };

      const initialTimeout = setTimeout(() => {
        checkUserSignature();
      }, 1500);

      const interval = setInterval(() => {
        if (!showConsentModal) {
          checkUserSignature();
        }
      }, 10000);

      return () => {
        clearTimeout(initialTimeout);
        clearInterval(interval);
      };
    }
  }, [isSignedIn, user, isLoaded, getToken, showConsentModal]);

  const handleConsentComplete = async () => {
    setShowConsentModal(false);
  };

  const handleConsentReject = async () => {
    try {
      setShowConsentModal(false);
      await signOut();
    } catch (error) {
      console.error("❌ [AuthContext] Error signing out:", error);
      setShowConsentModal(false);
    }
  };

  const value: AuthContextType = {
    isSignedIn: !!isSignedIn,
    user,
    userId,
    userRole,
    userType,
    orgRole,
    isLoading: !isLoaded || profileLoading,
    signIn: () => openSignIn(),
    signOut: () => signOut(),
    openUserProfile: () => openUserProfile(),
    getToken: () => getToken(),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <PolicyConsentModal
        visible={showConsentModal}
        onComplete={handleConsentComplete}
        onReject={handleConsentReject}
        language="en"
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
