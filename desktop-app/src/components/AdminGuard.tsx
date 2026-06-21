import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

interface AdminGuardProps {
  children: React.ReactNode;
}

/**
 * AdminGuard component that ensures only ADMIN users can access the app.
 * Non-admin users are automatically logged out.
 */
export default function AdminGuard({ children }: AdminGuardProps) {
  const { isSignedIn, userRole, isLoading, signOut } = useAuth();

  useEffect(() => {

    // Don't check while loading - wait for role to be fetched
    if (isLoading) {
      return;
    }

    // If user is signed in but role is null, it might still be loading
    // Give it more time before logging out (role fetch might have failed)
    if (isSignedIn && userRole === null) {
      console.warn("AdminGuard: User signed in but role is null after loading completed");
      console.warn("This might indicate the role fetch failed or user is not registered");
      // Don't log out immediately - let the user see the access denied message
      return;
    }

    // If user is signed in but not an admin, log them out immediately
    if (isSignedIn && userRole !== null && userRole !== "ADMIN") {
      console.warn("AdminGuard: Non-admin user detected. Role:", userRole, "Logging out...");
      signOut();
    }

    // If user is signed in and is admin, log success
    if (isSignedIn && userRole === "ADMIN") {
    }
  }, [isSignedIn, userRole, isLoading, signOut]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            border: "4px solid #f3f3f3",
            borderTop: "4px solid #ec4899",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <p style={{ color: "#666" }}>Loading...</p>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  // Don't render children if user is not signed in or not an admin
  if (!isSignedIn || userRole !== "ADMIN") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
          Access Denied
        </h1>
        <p style={{ color: "#666", maxWidth: "400px" }}>
          {!isSignedIn
            ? "Please sign in to continue."
            : "This application is only available to administrators. You have been logged out."}
        </p>
      </div>
    );
  }

  // User is signed in and is an admin - render children
  return <>{children}</>;
}

