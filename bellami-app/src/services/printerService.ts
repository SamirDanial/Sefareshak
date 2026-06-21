import { Platform, PermissionsAndroid } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

let RNBluetoothClassic: any = null;
try {
  const mod = require("react-native-bluetooth-classic");
  // Some builds expose the module as default export, others as the module itself.
  const candidate = mod?.default ?? mod;
  const hasNative = Boolean(candidate && (candidate._nativeModule || candidate._native || candidate.nativeModule));
  RNBluetoothClassic = hasNative ? candidate : null;
} catch {
  RNBluetoothClassic = null;
}

export type PairedPrinter = {
  id: string;
  name?: string;
  address?: string;
};

const STORAGE_KEY = "lastPrinterAddress";

const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const toBase64 = (bytes: Uint8Array): string => {
  let output = "";
  let i = 0;
  while (i < bytes.length) {
    const a = bytes[i++] ?? 0;
    const b = i < bytes.length ? (bytes[i++] as number) : NaN;
    const c = i < bytes.length ? (bytes[i++] as number) : NaN;

    const triplet = (a << 16) | ((b as number) << 8) | (c as number);

    output += base64Alphabet[(triplet >> 18) & 0x3f];
    output += base64Alphabet[(triplet >> 12) & 0x3f];
    output += Number.isNaN(b) ? "=" : base64Alphabet[(triplet >> 6) & 0x3f];
    output += Number.isNaN(c) ? "=" : base64Alphabet[triplet & 0x3f];
  }
  return output;
};

const ensureAndroidPermissions = async () => {
  if (Platform.OS !== "android") return true;

  const perms: string[] = [];

  // Android 12+
  perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);

  // Some devices still require location for scanning (paired listing usually ok, but safe)
  perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);

  const results = await PermissionsAndroid.requestMultiple(perms as any);
  return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
};

const getBt = () => {
  if (!RNBluetoothClassic) return null;
  return RNBluetoothClassic;
};

export const printerService = {
  isAvailable(): boolean {
    return Platform.OS === "android" && Boolean(RNBluetoothClassic);
  },

  async getLastPrinterAddress(): Promise<string | null> {
    try {
      return (await AsyncStorage.getItem(STORAGE_KEY)) || null;
    } catch {
      return null;
    }
  },

  async setLastPrinterAddress(address: string | null): Promise<void> {
    try {
      if (!address) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        return;
      }
      await AsyncStorage.setItem(STORAGE_KEY, address);
    } catch {
    }
  },

  async listPairedPrinters(): Promise<PairedPrinter[]> {
    if (!this.isAvailable()) return [];

    const bt = getBt();
    if (!bt) return [];

    const ok = await ensureAndroidPermissions();
    if (!ok) {
      throw new Error("Bluetooth permission denied");
    }

    const isEnabledFn =
      typeof bt.isBluetoothEnabled === "function"
        ? bt.isBluetoothEnabled.bind(bt)
        : typeof bt.isEnabled === "function"
          ? bt.isEnabled.bind(bt)
          : null;
    if (!isEnabledFn) {
      throw new Error(
        "Bluetooth printing module isn't available in this build. Rebuild the Android app (dev client / EAS build) with react-native-bluetooth-classic."
      );
    }

    const enabled = await isEnabledFn();
    if (!enabled) {
      const requestEnableFn =
        typeof bt.requestBluetoothEnabled === "function"
          ? bt.requestBluetoothEnabled.bind(bt)
          : typeof bt.requestEnable === "function"
            ? bt.requestEnable.bind(bt)
            : null;
      if (requestEnableFn) {
        await requestEnableFn();
      }
    }

    if (typeof bt.getBondedDevices !== "function") {
      throw new Error("Bluetooth module is missing getBondedDevices()");
    }

    const devices = await bt.getBondedDevices();
    return (devices || []).map((d: any) => ({
      id: d.address || d.id,
      name: d.name,
      address: d.address,
    }));
  },

  async connect(address: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error("Bluetooth printing is not available on this platform");
    }

    const bt = getBt();
    if (!bt) {
      throw new Error("Bluetooth module not loaded");
    }

    const ok = await ensureAndroidPermissions();
    if (!ok) {
      throw new Error("Bluetooth permission denied");
    }

    const isEnabledFn =
      typeof bt.isBluetoothEnabled === "function"
        ? bt.isBluetoothEnabled.bind(bt)
        : typeof bt.isEnabled === "function"
          ? bt.isEnabled.bind(bt)
          : null;
    if (!isEnabledFn) {
      throw new Error(
        "Bluetooth printing module isn't available in this build. Rebuild the Android app (dev client / EAS build) with react-native-bluetooth-classic."
      );
    }

    const enabled = await isEnabledFn();
    if (!enabled) {
      const requestEnableFn =
        typeof bt.requestBluetoothEnabled === "function"
          ? bt.requestBluetoothEnabled.bind(bt)
          : typeof bt.requestEnable === "function"
            ? bt.requestEnable.bind(bt)
            : null;
      if (requestEnableFn) {
        await requestEnableFn();
      }
    }

    const connectFn =
      typeof bt.connectToDevice === "function"
        ? bt.connectToDevice.bind(bt)
        : typeof bt.connect === "function"
          ? bt.connect.bind(bt)
          : null;
    if (!connectFn) {
      throw new Error("Bluetooth module is missing connect()/connectToDevice()");
    }

    const connectedResult = await connectFn(address);
    if (!connectedResult) {
      throw new Error("Failed to connect to printer");
    }

    await this.setLastPrinterAddress(address);
  },

  async printBytes(address: string, bytes: Uint8Array): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error("Bluetooth printing is not available on this platform");
    }

    const bt = getBt();
    if (!bt) {
      throw new Error("Bluetooth module not loaded");
    }

    await this.connect(address);

    // Library supports write; it accepts string/base64 in some versions.
    // We send as base64 string to be safe.
    const b64 = toBase64(bytes);

    const writeFn =
      typeof bt.writeToDevice === "function"
        ? bt.writeToDevice.bind(bt)
        : typeof bt.write === "function"
          ? bt.write.bind(bt)
          : null;
    if (!writeFn) {
      throw new Error("Bluetooth module is missing write()/writeToDevice()");
    }

    await writeFn(address, b64, "base64");
  },
};
