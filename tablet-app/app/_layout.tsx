import React from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { LogBox, Platform, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as NavigationBar from 'expo-navigation-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';

import { ClerkProvider } from '@clerk/clerk-expo';
import { useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';

import '@/src/i18n/config';

import { AuthProvider } from '@/src/contexts/AuthContext';
import { AppModeProvider } from '@/src/contexts/AppModeContext';
import { LanguageProvider } from '@/src/contexts/LanguageContext';
import { OrganizationProvider } from '@/src/contexts/OrganizationContext';
import { PermissionProvider } from '@/src/contexts/PermissionContext';
import { ScrollProvider } from '@/src/contexts/ScrollContext';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    console.error('[ErrorBoundary] Caught error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Error details:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#ffffff' }}>
          <Text style={{ color: '#111827', fontSize: 16, marginBottom: 10 }}>Something went wrong</Text>
          <Text style={{ color: '#6b7280', fontSize: 12 }}>{this.state.error?.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export const unstable_settings = {
  anchor: 'index',
};

WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  useEffect(() => {
    LogBox.ignoreLogs(["Sending `onAnimatedValueUpdate` with no listeners registered."]);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setVisibilityAsync('hidden').catch(() => {
      // ignore
    });
  }, []);

  if (!publishableKey) {
    return (
      <ThemeProvider value={DefaultTheme}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Text>Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY</Text>
        </View>
      </ThemeProvider>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider value={DefaultTheme}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
              <LanguageProvider>
                <AuthProvider>
                  <AppModeProvider>
                    <OrganizationProvider>
                      <PermissionProvider>
                        <ScrollProvider>
                          <AuthGate />
                          <Stack initialRouteName="index">
                            <Stack.Screen name="index" options={{ headerShown: false }} />
                            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                            <Stack.Screen name="(admin)" options={{ headerShown: false }} />
                            <Stack.Screen name="no-access" options={{ headerShown: false }} />
                            <Stack.Screen name="mode-select" options={{ headerShown: false }} />
                            <Stack.Screen name="oauth-native-callback" options={{ headerShown: false }} />
                            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                          </Stack>
                          <StatusBar style="dark" />
                        </ScrollProvider>
                      </PermissionProvider>
                    </OrganizationProvider>
                  </AppModeProvider>
                </AuthProvider>
              </LanguageProvider>
            </ClerkProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const lastRedirectRef = useRef<string | null>(null);

  const first = segments[0];
  const isAuthGroup = first === '(auth)';
  const isOauthCallback = first === 'oauth-native-callback';

  // Enforce:
  // - signed out: always be in /(auth)
  // - signed in: never be in /(auth)
  // This avoids getting stuck on /no-access or /(admin) after logout.
  // It also avoids breaking the oauth-native-callback transient route.
  //
  // Note: we intentionally do not gate on Permission/Org loading here.
  // Authorization decisions are handled by app/index and /(admin)/_layout.
  useEffect(() => {
    if (!isLoaded) return;

    // signed out -> force auth
    if (!isSignedIn && !isAuthGroup && !isOauthCallback) {
      const target = '/(auth)/sign-in';
      if (lastRedirectRef.current !== target) {
        lastRedirectRef.current = target;
        router.replace(target as any);
      }
      return;
    }

    // signed in -> keep out of auth group
    if (isSignedIn && isAuthGroup) {
      const target = '/';
      if (lastRedirectRef.current !== target) {
        lastRedirectRef.current = target;
        router.replace(target as any);
      }
    }
  }, [isLoaded, isSignedIn, isAuthGroup, isOauthCallback, router]);

  return null;
}
