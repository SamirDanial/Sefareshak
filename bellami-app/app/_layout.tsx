import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import * as SystemUI from "expo-system-ui";
import * as NavigationBar from "expo-navigation-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text, Platform, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthWrapper } from "@/components/AuthWrapper";
import { AuthProvider } from "@/src/contexts/AuthContext";
import { OrganizationProvider } from "@/src/contexts/OrganizationContext";
import { BranchProvider } from "@/src/contexts/BranchContext";
import { WebSocketProvider } from "@/src/contexts/WebSocketContext";
import { GlobalToastProvider } from "@/src/contexts/GlobalToastContext";
import { GlobalOrderStatusListener } from "@/src/contexts/GlobalOrderStatusListener";
import { UnseenStatusChangesProvider } from "@/src/contexts/UnseenStatusChangesContext";
import { LanguageProvider, useLanguage } from "@/src/contexts/LanguageContext";
import { ScrollProvider } from "@/src/contexts/ScrollContext";
import { FullViewProvider } from "@/src/contexts/FullViewContext";
import { PermissionProvider } from "@/src/contexts/PermissionContext";
import { initStripe, StripeProvider } from "@stripe/stripe-react-native";
import SocketService from "@/src/services/socketService";
import { notificationService } from "@/src/services/notificationService";
import pushNotificationService from "@/src/services/pushNotificationService";
import { SplashScreenComponent } from "@/components/SplashScreen";
import FloatingCartActions from "@/components/FloatingCartActions";
import "@/src/i18n/config"; // Initialize i18n
import firebase from '@react-native-firebase/app';
import Constants from 'expo-constants';

// Initialize Firebase
if (!firebase.apps.length) {
  if (Platform.OS === 'android') {
    // Android auto-initializes from google-services.json
    // @ts-ignore - Firebase auto-initializes from google-services.json
    firebase.initializeApp();
  } else {
    // iOS requires explicit configuration
    firebase.initializeApp({
      apiKey: 'AIzaSyBzNSX5wFa0RSuEIogVUDVVb3kwlqNyycM',
      authDomain: 'next-foody-push-notification.firebaseapp.com',
      projectId: 'next-foody-push-notification',
      storageBucket: 'next-foody-push-notification.firebasestorage.app',
      messagingSenderId: '83819005664',
      appId: '1:83819005664:ios:1a2855261384a9902db285',
      databaseURL: 'https://next-foody-push-notification-default-rtdb.firebaseio.com',
    });
  }
}

const publishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const stripePublishableKey =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

// Initialize Stripe synchronously before app renders
if (stripePublishableKey) {
  try {
    initStripe({ publishableKey: stripePublishableKey });
  } catch (error) {
    console.error("❌ Failed to initialize Stripe:", error);
  }
} else {
  console.warn("⚠️ Stripe publishable key is missing!");
}

function AppContent() {
  // Subscribe to language changes to force re-render
  const { currentLanguage } = useLanguage();

  return (
    <AuthProvider>
      <OrganizationProvider>
        <PermissionProvider>
          <BranchProvider>
            <GlobalToastProvider>
              <UnseenStatusChangesProvider>
                <WebSocketProvider>
                  <ScrollProvider>
                    <FullViewProvider>
                      <GlobalOrderStatusListener
                        socketService={SocketService.getInstance()}
                      />
                      <AuthWrapper>
                        <StatusBar style="light" />
                        <View style={{ flex: 1 }}>
                          <Slot key={currentLanguage} />
                          <FloatingCartActions />
                        </View>
                      </AuthWrapper>
                    </FullViewProvider>
                  </ScrollProvider>
                </WebSocketProvider>
              </UnseenStatusChangesProvider>
            </GlobalToastProvider>
          </BranchProvider>
        </PermissionProvider>
      </OrganizationProvider>
    </AuthProvider>
  );
}

export default function RootLayout() {
  const [isSplashReady, setIsSplashReady] = useState(false);

  // Suppress development overlays and warnings
  useEffect(() => {
    if (__DEV__) {
      // Suppress Fast Refresh and reloading messages
      LogBox.ignoreLogs([
        /Fast Refresh/i,
        /refreshing/i,
        /Reloading/i,
      ]);
    }
  }, []);

  useEffect(() => {
    // Hide native splash screen immediately to prevent blocking
    const hideNativeSplash = async () => {
      try {
        const SplashScreen = require("expo-splash-screen");
        await SplashScreen.hideAsync();
      } catch (error) {
        // Ignore errors
      }
    };

    // Initialize app in background (non-blocking)
    const initializeApp = async () => {
      try {
        // Initialize notification service
        notificationService.init().catch((error) => {
          console.error("Failed to initialize notification service:", error);
        });

        // Set up push notification listeners
        pushNotificationService.setupNotificationListeners(
          (notification) => {
          },
          (response) => {
            const data = response.notification.request.content.data;
            if (data?.branchId) {
              // Navigate to home page with the specific branch
              const router = require("expo-router").router;
              router.push({
                pathname: "/(tabs)",
                params: { branchId: data.branchId },
              });
            } else if (data?.actionUrl) {
              // Handle action URL if present (fallback)
              const Linking = require("expo-linking");
              Linking.openURL(data.actionUrl);
            }
          }
        );

        // Hide navigation bar and status bar for immersive experience
        SystemUI.setBackgroundColorAsync("#fff");

        // Hide navigation bar on Android only
        if (Platform.OS === 'android') {
          NavigationBar.setVisibilityAsync("hidden");
        }
      } catch (error) {
        console.error("Error initializing app:", error);
      }
    };

    // Hide native splash and initialize app
    hideNativeSplash();
    initializeApp();

    // Force splash screen to finish after max 3 seconds (safety timeout)
    const timeout = setTimeout(() => {
      setIsSplashReady(true);
    }, 3000);

    // Cleanup listeners on unmount
    return () => {
      clearTimeout(timeout);
      pushNotificationService.removeNotificationListeners();
    };
  }, []);

  // Don't render ClerkProvider if publishable key is missing
  if (!publishableKey) {
    console.error("Clerk publishable key is missing!");
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#151718",
        }}
      >
        <Text style={{ color: "#fff" }}>
          Error: Clerk publishable key is missing
        </Text>
      </View>
    );
  }

  // Render app with StripeProvider only if Stripe key is available
  const appContent = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          <LanguageProvider>
            <AppContent />
          </LanguageProvider>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

  // Wrap with StripeProvider only if key is available
  const wrappedApp = stripePublishableKey ? (
    <StripeProvider publishableKey={stripePublishableKey}>
      {appContent}
    </StripeProvider>
  ) : (
    appContent
  );

  // Always render the app, show custom splash screen on top if needed
  return (
    <>
      {wrappedApp}
      {!isSplashReady && (
        <SplashScreenComponent onFinish={() => setIsSplashReady(true)} />
      )}
    </>
  );
}
