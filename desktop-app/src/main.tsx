import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import './index.css';
import './i18n/config';

// Get the publishable key from environment variables
const clerkPublishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Debug logging - show in alert for visibility
if (!clerkPublishableKey) {
  alert('ERROR: Clerk publishable key is missing! Check .env file and rebuild.');
} else {
}

// Check if we have a valid Clerk key
const isValidClerkKey =
  clerkPublishableKey &&
  clerkPublishableKey.startsWith("pk_") &&
  clerkPublishableKey !== "pk_test_your_publishable_key_here";

// For Electron, we use a custom redirect URL for OAuth callbacks
// This will open the system browser for authentication, then redirect back to the app
const redirectUrl = "bellami-desktop://auth-callback";

// Error boundary component for Clerk failures
const ClerkErrorBoundary: React.FC<{ error: Error | null; children: React.ReactNode }> = ({ error, children }) => {
  if (error) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "1rem",
        padding: "2rem",
        textAlign: "center",
        backgroundColor: "#f9fafb"
      }}>
        <div style={{
          padding: "2rem",
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          maxWidth: "600px"
        }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#dc2626", marginBottom: "1rem" }}>
            Clerk Authentication Error
          </h1>
          <p style={{ color: "#666", marginBottom: "1rem" }}>
            Clerk failed to initialize. This is likely due to Electron's file:// protocol compatibility issues.
          </p>
          <p style={{ color: "#666", marginBottom: "1rem", fontSize: "0.9rem" }}>
            <strong>Error:</strong> {error.message}
          </p>
          <p style={{ color: "#666", fontSize: "0.9rem" }}>
            The app may still function, but authentication features will be unavailable.
            Try running in development mode with the Vite dev server instead.
          </p>
        </div>
        {children}
      </div>
    );
  }
  return <>{children}</>;
};

const AppContent = () => {
  const [clerkError, setClerkError] = React.useState<Error | null>(null);
  
  // Listen for OAuth callbacks from Electron
  React.useEffect(() => {
    if (!window.electronAPI?.onOAuthCallback) return;
    
    const cleanup = window.electronAPI.onOAuthCallback((url: string) => {
      try {
        const urlObj = new URL(url);
        const redirectUrl = urlObj.searchParams.get('__clerk_redirect_url');
        if (redirectUrl) {
          // Navigate to the redirect URL to complete the OAuth flow
          window.location.href = redirectUrl;
        }
      } catch (error) {
        console.error('Error parsing OAuth callback:', error);
      }
    });
    
    return cleanup;
  }, []);
  
  // Listen for Clerk errors and suppress 401 errors (expected in Electron)
  React.useEffect(() => {
    if (!isValidClerkKey) return;
    
    const errorHandler = (event: ErrorEvent) => {
      const errorMsg = event.error?.message || event.message || '';
      // Catch all Clerk-related errors
      if (errorMsg.includes('ClerkJS') || errorMsg.includes('Clerk') || errorMsg.includes('clerk')) {
        // Suppress 401 errors - they're expected in Electron due to file:// protocol
        if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
          console.warn('Clerk 401 error (expected in Electron file:// protocol):', errorMsg);
          event.preventDefault(); // Suppress the error
          return;
        }
        // Catch initialization errors
        if (errorMsg.includes('Something went wrong initializing') || errorMsg.includes('initializing Clerk')) {
          console.warn('Clerk initialization failed (expected in Electron file:// protocol):', errorMsg);
          setClerkError(new Error('Clerk initialization failed - Electron file:// protocol limitation'));
          event.preventDefault(); // Suppress the error
          return;
        }
        console.error('Clerk error detected:', event.error || event.message);
        setClerkError(event.error || new Error(errorMsg));
      }
    };
    
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const errorMsg = event.reason?.message || String(event.reason) || '';
      // Catch all Clerk-related errors
      if (errorMsg.includes('ClerkJS') || errorMsg.includes('Clerk') || errorMsg.includes('clerk')) {
        // Suppress 401 errors - they're expected in Electron due to file:// protocol
        if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
          console.warn('Clerk 401 error (expected in Electron file:// protocol):', errorMsg);
          event.preventDefault(); // Suppress the error
          return;
        }
        // Catch initialization errors
        if (errorMsg.includes('Something went wrong initializing') || errorMsg.includes('initializing Clerk')) {
          console.warn('Clerk initialization failed (expected in Electron file:// protocol):', errorMsg);
          setClerkError(new Error('Clerk initialization failed - Electron file:// protocol limitation'));
          event.preventDefault(); // Suppress the error
          return;
        }
        console.error('Clerk rejection detected:', event.reason);
        setClerkError(event.reason instanceof Error ? event.reason : new Error(errorMsg));
      }
    };
    
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);
    
    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    };
  }, [isValidClerkKey]);
  
  if (isValidClerkKey) {
    return (
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        signInFallbackRedirectUrl={redirectUrl}
        signUpFallbackRedirectUrl={redirectUrl}
        appearance={{
          baseTheme: undefined,
          variables: {
            colorPrimary: "#ec4899",
            colorBackground: "#ffffff",
            colorInputBackground: "#ffffff",
            colorText: "#000000",
            colorTextSecondary: "#666666",
            borderRadius: "0.75rem",
          },
          elements: {
            formButtonPrimary: {
              backgroundColor: "#ec4899",
              "&:hover": {
                backgroundColor: "#db2777",
              },
            },
            card: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
            },
            headerTitle: {
              color: "#000000",
            },
            headerSubtitle: {
              color: "#666666",
            },
            formFieldInput: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              color: "#000000",
              "&:focus": {
                borderColor: "#ec4899",
                boxShadow: "0 0 0 2px rgba(236, 72, 153, 0.2)",
              },
            },
            formFieldLabel: {
              color: "#000000",
            },
            footerActionLink: {
              color: "#ec4899",
              "&:hover": {
                color: "#db2777",
              },
            },
          },
        }}
      >
        <ClerkErrorBoundary error={clerkError}>
          <App />
        </ClerkErrorBoundary>
      </ClerkProvider>
    );
  } else {
    console.error(
      "Clerk authentication is required but no valid publishable key was found. " +
      "Please set VITE_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env file."
    );
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "1rem",
        padding: "2rem",
        textAlign: "center",
      }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#dc2626" }}>
          Configuration Error
        </h1>
        <p style={{ color: "#666", maxWidth: "500px" }}>
          Clerk authentication is required but not properly configured.
          Please set VITE_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env file.
        </p>
      </div>
    );
  }
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppContent />
  </React.StrictMode>,
);

