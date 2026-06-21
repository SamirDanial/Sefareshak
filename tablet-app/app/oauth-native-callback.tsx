import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) {
      const timer = setTimeout(() => {
        router.replace('/' as any);
      }, 300);
      return () => clearTimeout(timer);
    }

    const errorTimer = setTimeout(() => {
      router.replace('/(auth)/sign-in' as any);
    }, 800);

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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  text: {
    marginTop: 16,
    color: '#111827',
    fontSize: 16,
  },
});
