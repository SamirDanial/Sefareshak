import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Image,
  Dimensions,
  Easing,
  Modal,
} from "react-native";
import * as SplashScreen from "expo-splash-screen";

const { width, height } = Dimensions.get("window");

interface SplashScreenProps {
  onFinish: () => void;
}

// Don't prevent auto-hide - let native splash hide naturally

export function SplashScreenComponent({ onFinish }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const backgroundOpacity = useRef(new Animated.Value(1)).current;
  const particle1 = useRef(new Animated.Value(0)).current;
  const particle2 = useRef(new Animated.Value(0)).current;
  const particle3 = useRef(new Animated.Value(0)).current;
  const particle4 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start animations
    Animated.parallel([
      // Logo scale and fade in
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.spring(logoScale, {
            toValue: 1,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.timing(logoOpacity, {
            toValue: 1,
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
      // Floating particles (food icons)
      Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(particle1, {
              toValue: 1,
              duration: 2000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(particle1, {
              toValue: 0,
              duration: 2000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.delay(500),
            Animated.timing(particle2, {
              toValue: 1,
              duration: 1800,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(particle2, {
              toValue: 0,
              duration: 1800,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.delay(1000),
            Animated.timing(particle3, {
              toValue: 1,
              duration: 2200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(particle3, {
              toValue: 0,
              duration: 2200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.delay(300),
            Animated.timing(particle4, {
              toValue: 1,
              duration: 1900,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(particle4, {
              toValue: 0,
              duration: 1900,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        ),
      ]),
    ]).start();

    // Hide splash screen after minimum display time
    const timer = setTimeout(() => {
      // Fade out animation
      Animated.parallel([
        Animated.timing(backgroundOpacity, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setVisible(false);
        onFinish();
      });
    }, 1500); // Show for 1.5 seconds

    return () => clearTimeout(timer);
  }, []);

  // Particle positions
  const particle1TranslateY = particle1.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -30],
  });
  const particle1Opacity = particle1.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1, 0.3],
  });

  const particle2TranslateY = particle2.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -25],
  });
  const particle2Opacity = particle2.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1, 0.3],
  });

  const particle3TranslateY = particle3.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -35],
  });
  const particle3Opacity = particle3.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1, 0.3],
  });

  const particle4TranslateY = particle4.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -28],
  });
  const particle4Opacity = particle4.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1, 0.3],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View
        style={[
          styles.container,
          {
            opacity: backgroundOpacity,
          },
        ]}
      >
        {/* Animated background gradient effect */}
        <View style={styles.backgroundGradient} />

        {/* Floating particles (decorative elements) */}
        <Animated.View
          style={[
            styles.particle,
            styles.particle1,
            {
              opacity: particle1Opacity,
              transform: [{ translateY: particle1TranslateY }],
            },
          ]}
        >
          <View style={styles.particleCircle} />
        </Animated.View>

        <Animated.View
          style={[
            styles.particle,
            styles.particle2,
            {
              opacity: particle2Opacity,
              transform: [{ translateY: particle2TranslateY }],
            },
          ]}
        >
          <View style={styles.particleCircle} />
        </Animated.View>

        <Animated.View
          style={[
            styles.particle,
            styles.particle3,
            {
              opacity: particle3Opacity,
              transform: [{ translateY: particle3TranslateY }],
            },
          ]}
        >
          <View style={styles.particleCircle} />
        </Animated.View>

        <Animated.View
          style={[
            styles.particle,
            styles.particle4,
            {
              opacity: particle4Opacity,
              transform: [{ translateY: particle4TranslateY }],
            },
          ]}
        >
          <View style={styles.particleCircle} />
        </Animated.View>

        {/* Main logo */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require("@/assets/images/splash-icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Loading indicator */}
        <Animated.View
          style={[
            styles.loadingContainer,
            {
              opacity: logoOpacity,
            },
          ]}
        >
          <View style={styles.loadingDots}>
            <Animated.View
              style={[
                styles.loadingDot,
                {
                  opacity: particle1Opacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.loadingDot,
                {
                  opacity: particle2Opacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.loadingDot,
                {
                  opacity: particle3Opacity,
                },
              ]}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0a0a",
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0a0a0a",
    // Subtle gradient effect
    opacity: 1,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  logo: {
    width: 200,
    height: 200,
  },
  particle: {
    position: "absolute",
  },
  particle1: {
    top: "20%",
    left: "15%",
  },
  particle2: {
    top: "25%",
    right: "20%",
  },
  particle3: {
    bottom: "30%",
    left: "20%",
  },
  particle4: {
    bottom: "25%",
    right: "15%",
  },
  particleCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ec4899",
    shadowColor: "#ec4899",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingContainer: {
    marginTop: 40,
    alignItems: "center",
  },
  loadingDots: {
    flexDirection: "row",
    gap: 8,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ec4899",
    marginHorizontal: 4,
  },
});
