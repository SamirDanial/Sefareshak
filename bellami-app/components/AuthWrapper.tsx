import { useEffect, useState } from "react";
import { useAuth, useUser, useClerk } from "@clerk/clerk-expo";
import ApiService from "@/src/services/apiService";
import pushNotificationService from "@/src/services/pushNotificationService";
import { PolicyConsentModal } from "./PolicyConsentModal";

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const apiService = ApiService.getInstance();
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [hasCheckedConsent, setHasCheckedConsent] = useState(false);

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

  // Check user signature status after sign in and periodically
  useEffect(() => {
    if (isSignedIn && user && isLoaded && !hasCheckedConsent) {
      const checkUserSignature = async () => {
        try {
          const token = await getToken();
          if (!token) {
            return;
          }

          // Check user's signature status from database
          const signatureResponse = await fetch(
            `${apiService.getBaseUrl()}/api/user/signature-status`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (signatureResponse.ok) {
            const signatureData = await signatureResponse.json();
            
            if (signatureData.success && !signatureData.data.hasAcceptedRequiredPolicies) {
              try {
                const policiesResponse = await fetch(
                  `${apiService.getBaseUrl()}/api/terms-and-policies/active/all?language=en`
                );

                if (policiesResponse.ok) {
                  const policiesData = await policiesResponse.json();
                  // Filter for required policies
                  const requiredPolicies = policiesData.success && policiesData.data 
                    ? policiesData.data.filter((p: any) => p.isRequired === true)
                    : [];
                  if (requiredPolicies.length > 0) {
                    // Show consent modal
                    setShowConsentModal(true);
                    setHasCheckedConsent(false);
                  } else {
                    setHasCheckedConsent(true);
                  }
                } else {
                  const errorText = await policiesResponse.text().catch(() => "Unknown error");
                  console.error("❌ [AuthWrapper] Failed to fetch policies:", policiesResponse.status, errorText);
                  setHasCheckedConsent(true);
                }
              } catch (fetchError) {
                console.error("❌ [AuthWrapper] Error fetching policies:", fetchError);
                setHasCheckedConsent(true);
              }
            } else {
              setHasCheckedConsent(true);
              // Hide modal if it was showing
              if (showConsentModal) {
                setShowConsentModal(false);
              }
            }
          } else {
            if (signatureResponse.status === 401) {
              // This usually means the token isn't accepted yet (issuer config),
              // or the user hasn't been created in our DB yet.
              // Avoid spamming logs and let other flows (registerUser) settle.
              setHasCheckedConsent(true);
              return;
            }

            const errorText = await signatureResponse.text().catch(() => "Unknown error");
            console.error(
              "❌ [AuthWrapper] Failed to fetch signature status:",
              signatureResponse.status,
              errorText
            );
          }
        } catch (error) {
          console.error("❌ [AuthWrapper] Error checking user signature:", error);
        }
      };

      // Wait for user registration, then check immediately
      const initialTimeout = setTimeout(() => {
        checkUserSignature();
      }, 2500);

      // Also set up periodic check every 10 seconds (for testing purposes)
      // This will detect when signature is manually changed in database
      // Only check if modal is not currently showing to avoid conflicts
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
  }, [isSignedIn, user, isLoaded, getToken, apiService, showConsentModal, hasCheckedConsent]);

  const handleConsentComplete = async () => {
    // Signature is automatically updated in database when all policies are accepted
    setShowConsentModal(false);
    setHasCheckedConsent(true);
  };

  const handleConsentReject = async () => {
    try {
      setShowConsentModal(false);
      await signOut();
    } catch (error) {
      console.error("❌ [AuthWrapper] Error signing out:", error);
      // Force close modal even if signOut fails
      setShowConsentModal(false);
    }
  };

  // Initialize push notifications when user signs in
  useEffect(() => {
    if (isSignedIn && isLoaded) {
      const initPushNotifications = async () => {
        try {
          // Check if push notifications are supported
          const isSupported = await pushNotificationService.isSupported();
          if (!isSupported) {
            return;
          }

          // Check permission status
          const permissionStatus =
            await pushNotificationService.getPermissionStatus();

          // If permission is granted, register for push notifications
          if (permissionStatus === "granted") {
            const token = await getToken();
            if (token) {
              await pushNotificationService.registerForPushNotifications(token);
            }
          }
        } catch (error) {
          console.error("Failed to initialize push notifications:", error);
        }
      };

      initPushNotifications();
    }
  }, [isSignedIn, isLoaded, getToken]);

  return (
    <>
      {children}
      <PolicyConsentModal
        visible={showConsentModal}
        onComplete={handleConsentComplete}
        onReject={handleConsentReject}
        language="en"
      />
    </>
  );
}
