// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add extensions for socket.io-client and its dependencies
config.resolver.sourceExts = [...config.resolver.sourceExts, "mjs", "cjs"];

// Enable node modules resolution for socket.io dependencies
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

// Note: Fast Refresh overlay is controlled by React Native runtime
// To disable it, you can restart Metro with: npx expo start --no-dev
// Or disable Fast Refresh in app.json by setting "fastRefresh": false

module.exports = config;
