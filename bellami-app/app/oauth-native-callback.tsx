import { useEffect } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";

// Complete the OAuth session
WebBrowser.maybeCompleteAuthSession();

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const params = useLocalSearchParams();

  useEffect(() => {
    // Wait for auth to be loaded
    if (!isLoaded) {
      return;
    }

    // If user is signed in, redirect to home
    if (isSignedIn) {
      router.replace("/(tabs)" as any);
      return;
    }

    // If not signed in after callback, redirect back to sign in
    // This handles error cases
    const errorTimer = setTimeout(() => {
      router.replace("/(auth)/sign-in" as any);
    }, 2000);

    return () => clearTimeout(errorTimer);
  }, [isLoaded, isSignedIn, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#ec4899" />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#151718",
  },
  text: {
    marginTop: 16,
    color: "#fff",
    fontSize: 16,
  },
});
