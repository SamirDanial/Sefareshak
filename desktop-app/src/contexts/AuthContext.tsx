import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useUser, useClerk, useAuth as useClerkAuth } from "@clerk/clerk-react";
import ApiService from "../services/apiService";

interface AuthContextType {
  isSignedIn: boolean;
  user: any;
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
  // CRITICAL: All hooks must be called unconditionally (Rules of Hooks)
  // Note: If we're here, we're guaranteed to be inside ClerkProvider (main.tsx handles invalid keys)
  const [clerkFailed, setClerkFailed] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [isLoadingRole, setIsLoadingRole] = useState(false);
  
  // Use Clerk hooks - they MUST be called unconditionally (Rules of Hooks)
  // We can't return early before calling hooks, even if Clerk failed
  // These hooks should be safe to call even if Clerk fails - they'll return default values
  const { isSignedIn: clerkIsSignedIn, user: clerkUser, isLoaded: clerkIsLoaded } = useUser();
  const { openSignIn: clerkOpenSignIn, openUserProfile: clerkOpenUserProfile, signOut: clerkSignOut } = useClerk();
  const { getToken: clerkGetToken } = useClerkAuth();
  
  useEffect(() => {
    // Listen for Clerk errors
    // BUT: Don't mark as failed if user is already signed in (Clerk is working)
    const errorHandler = (event: ErrorEvent) => {
      const errorMsg = event.error?.message || event.message || '';
      // Catch all Clerk-related errors, including initialization failures
      if (errorMsg.includes('ClerkJS') || errorMsg.includes('Clerk') || errorMsg.includes('clerk') || errorMsg.includes('Something went wrong initializing')) {
        // Suppress 401 errors - they're expected
        if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
          return;
        }
        // Don't mark as failed if user is signed in - Clerk is working
        if (clerkIsSignedIn) {
          return;
        }
        console.warn('Clerk initialization failed (expected in Electron):', errorMsg);
        setClerkFailed(true);
        event.preventDefault(); // Suppress the error
      }
    };
    
    // Also listen for unhandled promise rejections
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const errorMsg = event.reason?.message || String(event.reason) || '';
      // Catch all Clerk-related errors, including initialization failures
      if (errorMsg.includes('ClerkJS') || errorMsg.includes('Clerk') || errorMsg.includes('clerk') || errorMsg.includes('Something went wrong initializing')) {
        // Suppress 401 errors - they're expected
        if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
          event.preventDefault();
          return;
        }
        // Don't mark as failed if user is signed in - Clerk is working
        if (clerkIsSignedIn) {
          event.preventDefault();
          return;
        }
        console.warn('Clerk promise rejection (expected in Electron):', errorMsg);
        setClerkFailed(true);
        event.preventDefault(); // Suppress the error
      }
    };
    
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);
    
    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    };
  }, [clerkIsSignedIn]);
  
  // If Clerk hasn't loaded after a timeout, assume it failed
  // BUT: Don't mark as failed if user is already signed in
  // This prevents resetting auth state when Clerk is slow to initialize in Electron
  useEffect(() => {
    // Only set timeout if Clerk hasn't loaded AND user is not signed in
    // If user is signed in, Clerk is working (just slow to report isLoaded)
    if (!clerkIsLoaded && !clerkFailed && !clerkIsSignedIn) {
      const timeout = setTimeout(() => {
        // Only mark as failed if user is still NOT signed in
        if (!clerkIsLoaded && !clerkIsSignedIn) {
          console.warn('Clerk isLoaded timeout - assuming failure (user not signed in)');
          setClerkFailed(true);
        }
      }, 5000); // Increased to 5 seconds for Electron
      
      return () => clearTimeout(timeout);
    }
    
    // If user is signed in but Clerk hasn't reported isLoaded, that's OK
    // Clerk is working, just slow to report isLoaded in Electron
    if (!clerkIsLoaded && clerkIsSignedIn && !clerkFailed) {
    }
  }, [clerkIsLoaded, clerkFailed, clerkIsSignedIn]);

  const apiService = ApiService.getInstance();

  // Auto-register user when they sign in, then fetch role
  // Only run if Clerk hasn't failed
  useEffect(() => {
    if (clerkFailed) return; // Don't proceed if Clerk failed
    if (!clerkGetToken) return; // Don't proceed if getToken is not available
    
    if (clerkIsSignedIn && clerkUser && clerkIsLoaded) {
      const registerAndFetchRole = async () => {
        try {
          
          await apiService.registerUser({
            clerkId: clerkUser.id,
            email: clerkUser.emailAddresses[0]?.emailAddress || "",
            firstName: clerkUser.firstName || undefined,
            lastName: clerkUser.lastName || undefined,
            phone: clerkUser.phoneNumbers[0]?.phoneNumber || undefined,
          });
          // Step 2: Wait a bit for the backend to process, then fetch role
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Step 3: Fetch user role with retry
          setIsLoadingRole(true);
          
          let retries = 3;
          let roleFetched = false;
          
          while (retries > 0 && !roleFetched) {
            try {
              const token = await clerkGetToken();
              
              if (!token) {
                console.error("No authentication token available");
                await new Promise(resolve => setTimeout(resolve, 1000));
                retries--;
                continue;
              }
              const result = await apiService.getUserProfile(token);
              
              if (result && result.success && result.data) {
                const nextUserType = (result.data as any).userType as string | undefined;
                const nextOrgRole = (result.data as any).orgRole as string | undefined;
                setUserType(nextUserType || null);
                setOrgRole(nextOrgRole || null);

                // Backward-compatible: map new RBAC userType/orgRole to legacy userRole
                // This matches the web frontend logic.
                if (
                  (nextUserType && nextUserType !== "USER") ||
                  nextOrgRole === "ORG_OWNER" ||
                  nextOrgRole === "ORG_ADMIN"
                ) {
                  setUserRole("ADMIN");
                } else {
                  setUserRole("USER");
                }
                roleFetched = true;
              } else {
                console.error("Invalid response format:", result);
                console.error("Result structure:", {
                  hasResult: !!result,
                  hasSuccess: result?.success,
                  hasData: !!result?.data,
                  resultKeys: result ? Object.keys(result) : [],
                  dataKeys: result?.data ? Object.keys(result.data) : [],
                });
                retries--;
                if (retries > 0) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
            } catch (fetchError: any) {
              console.error(`Failed to fetch role (attempt ${4 - retries}/3):`, fetchError);
              retries--;
              if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }
          
          if (!roleFetched) {
            console.error("Failed to fetch user role after all retries");
          }
        } catch (error: any) {
          console.error("Failed to register/fetch user role:", error);
          console.error("Error details:", {
            message: error?.message,
            status: error?.status,
            stack: error?.stack,
          });
        } finally {
          setIsLoadingRole(false);
        }
      };

      registerAndFetchRole();
    } else {
      setUserRole(null);
      setUserType(null);
      setOrgRole(null);
      setIsLoadingRole(false);
    }
  }, [clerkIsSignedIn, clerkUser, clerkIsLoaded, apiService, clerkGetToken, clerkFailed]);

  // If Clerk failed, use fallback values
  // BUT: Don't reset userRole if it's already been set
  if (clerkFailed && userRole === null) {
    console.warn('Clerk failed to initialize - using fallback auth context');
  } else if (clerkFailed && userRole !== null) {
  }

  const signIn = () => {
    if (clerkFailed || !clerkOpenSignIn) {
      alert('Clerk authentication is not available. This may be due to Electron compatibility issues. Please check the console for details.');
      return;
    }
    // In Electron, openSignIn will use OAuth flow with system browser
    // The redirect URL (bellami-desktop://auth-callback) will be intercepted by Electron
    clerkOpenSignIn({
      redirectUrl: 'bellami-desktop://auth-callback',
    });
  };

  const handleSignOut = () => {
    if (clerkFailed || !clerkSignOut) {
      console.warn("Authentication not available");
      return;
    }
    clerkSignOut();
  };

  const handleOpenUserProfile = () => {
    if (clerkFailed || !clerkOpenUserProfile) {
      console.warn("Authentication not available");
      return;
    }
    clerkOpenUserProfile();
  };

  // Determine if we're still loading
  // We're loading if:
  // 1. Clerk hasn't loaded yet AND user is not signed in (waiting for Clerk), OR
  // 2. User is signed in and we're actively fetching the role
  // Note: If user is signed in but clerkIsLoaded is false, Clerk is working (just slow)
  //       so we don't wait for it - we proceed with role fetching
  const isActuallyLoading = clerkFailed 
    ? false 
    : ((!clerkIsLoaded && !clerkIsSignedIn) || (clerkIsSignedIn && isLoadingRole));

  // Don't reset userRole if it's already been set, even if Clerk failed
  // This prevents losing the role when Clerk times out in Electron
  // Once we have a role, keep it even if Clerk reports as failed
  const finalUserRole = userRole;
  
  const value: AuthContextType = {
    isSignedIn: clerkFailed ? false : (clerkIsSignedIn || false),
    user: clerkFailed ? null : clerkUser,
    // Preserve userRole even if Clerk fails (as long as it was set)
    userRole: finalUserRole,
    userType,
    orgRole,
    // Keep loading until role is fetched (or we know it failed)
    isLoading: isActuallyLoading,
    signIn,
    signOut: handleSignOut,
    openUserProfile: handleOpenUserProfile,
    getToken: clerkFailed ? (() => Promise.resolve(null)) : (clerkGetToken || (() => Promise.resolve(null))),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

