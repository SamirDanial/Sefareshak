// Check if we're in development mode
// EAS_BUILD_PROFILE is set during EAS builds
// NODE_ENV is set when running locally
const IS_DEV = 
  process.env.EAS_BUILD_PROFILE === "development" ||
  process.env.NODE_ENV === "development" ||
  !process.env.EAS_BUILD_PROFILE; // If EAS_BUILD_PROFILE is not set, assume development

module.exports = {
  expo: {
    name: "Next Foody",
    slug: "next-foody",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "nextfoody",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      statusBarStyle: "dark",
      bundleIdentifier: "com.nextfoody.mobile",
      infoPlist: {
        NSCameraUsageDescription:
          "This app needs access to your camera to take photos of meals.",
        NSPhotoLibraryUsageDescription:
          "This app needs access to your photo library to select meal images.",
        NSLocationWhenInUseUsageDescription:
          "This app needs access to your location to check delivery availability and suggest nearby addresses.",
        UISupportedInterfaceOrientations: [
          "UIInterfaceOrientationPortrait",
          "UIInterfaceOrientationLandscapeLeft",
          "UIInterfaceOrientationLandscapeRight",
        ],
        ITSAppUsesNonExemptEncryption: false,
        LSApplicationQueriesSchemes: ["tel", "mailto", "http", "https"],
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#0a0a0a",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      navigationBar: {
        visible: "immersive",
      },
      statusBarStyle: "dark",
      package: "com.nextfoody.mobile",
      googleServicesFile: "./google-services.json",
      permissions: [
        "BLUETOOTH",
        "BLUETOOTH_ADMIN",
        "BLUETOOTH_CONNECT",
        "BLUETOOTH_SCAN",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "RECORD_AUDIO",
        "POST_NOTIFICATIONS",
      ],
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#0a0a0a",
          dark: {
            backgroundColor: "#0a0a0a",
          },
        },
      ],
      "expo-system-ui",
      "expo-screen-orientation",
      "expo-localization",
      "expo-secure-store",
      "expo-web-browser",
      [
        "expo-image-picker",
        {
          photosPermission:
            "The app accesses your photos to let you share them.",
        },
      ],
      [
        "@stripe/stripe-react-native",
        {
          enableGooglePay: true,
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "This app needs access to your location to check delivery availability and suggest nearby addresses.",
        },
      ],
      "@react-native-community/datetimepicker",
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon.png",
          color: "#ec4899",
        },
      ],
      "./plugins/withModularHeaders.js",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      apiBaseUrl: IS_DEV ? "http://localhost:3001" : "https://nextfoody.com",
      router: {},
      eas: {
        projectId: "f66c0153-48c3-4953-b5f3-e1607e1d52af",
      },
    },
  },
};
