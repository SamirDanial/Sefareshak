import { Platform, PermissionsAndroid } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

let RNBluetoothClassic: any = null;
try {
  const mod = require("react-native-bluetooth-classic");
  const candidate = mod?.default ?? mod;
  
  // More permissive native module detection
  const hasNative = Boolean(
    candidate && (
      candidate._nativeModule || 
      candidate._native || 
      candidate.nativeModule ||
      candidate.getDefault ||
      candidate.isBluetoothEnabled ||
      candidate.isEnabled ||
      candidate.requestBluetoothEnabled ||
      candidate.requestEnable ||
      candidate.getPairedDevices ||
      candidate.connect ||
      candidate.printBytes
    )
  );
  
  // On Android, be more permissive - if the module loads, assume it works
  if (Platform.OS === "android" && candidate) {
    RNBluetoothClassic = candidate;
  } else {
    RNBluetoothClassic = hasNative ? candidate : null;
  }
} catch (error) {
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
  if (Platform.OS !== "android") {
    return true;
  }

  const perms: string[] = [];
  perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
  perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);

  try {
    const bluetoothConnect = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    const bluetoothScan = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    const location = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    
    const currentStatus = {
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: bluetoothConnect,
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: bluetoothScan,
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: location,
    };
    
    
    // Check which permissions are already granted
    const missingPermissions = perms.filter(perm => !currentStatus[perm]);
    
    // If all permissions are already granted, return true
    if (missingPermissions.length === 0) {
      return true;
    }
    
    // Only request missing permissions individually
    
    const results: any = {};
    
    for (const permission of missingPermissions) {
      try {
        
        // Use individual permission request with timeout
        const requestPromise = PermissionsAndroid.request(permission as any);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Permission request timeout for ${permission}`)), 5000);
        });
        
        const result = await Promise.race([requestPromise, timeoutPromise]) as any;
        results[permission] = result;
        
        // Add a small delay between permission requests to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        results[permission] = 'denied';
      }
    }
    
    // Combine existing and new permissions with better error handling
    let finalStatus: any = {};
    try {
      finalStatus = { ...currentStatus, ...results };
    } catch (error) {
      finalStatus = currentStatus;
    }
    
    const allGranted = Object.values(finalStatus).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
    
    return allGranted;
    
  } catch (error) {
    
    // Fallback: try to check individual permissions
    try {
      const bluetoothConnect = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      const bluetoothScan = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
      const location = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);

      if (bluetoothConnect && bluetoothScan) {
        return true;
      }
      
      // If permissions are not granted, provide helpful error message
      if (!bluetoothConnect || !bluetoothScan) {
        
        // Create a more descriptive error
        const missingPerms = [];
        if (!bluetoothConnect) missingPerms.push('BLUETOOTH_CONNECT');
        if (!bluetoothScan) missingPerms.push('BLUETOOTH_SCAN');
        
        throw new Error(`Bluetooth permissions not granted. Please manually enable: ${missingPerms.join(', ')}. Go to Settings > Apps > Tablet App > Permissions > Nearby devices and enable Bluetooth permissions.`);
      }
      
    } catch (fallbackError) {
      throw new Error('Unable to check Bluetooth permissions. Please manually enable Bluetooth permissions in Settings > Apps > Tablet App > Permissions > Nearby devices.');
    }
    return false;
  }
};

const getBt = () => {
  if (!RNBluetoothClassic) return null;
  return RNBluetoothClassic;
};

export const printerService = {
  isAvailable(): boolean {
    const isAndroid = Platform.OS === "android";
    const hasBluetooth = Boolean(RNBluetoothClassic);
    return isAndroid && hasBluetooth;
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
    
    try {
      // Add timeout but make it more reasonable and handle gracefully
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Bluetooth operation timeout')), 15000);
      });

      const result = await Promise.race([
        this._listPairedPrintersInternal(),
        timeoutPromise
      ]);
      return result;
    } catch (error: any) {
      
      // Handle timeout gracefully
      if (error?.message?.includes('timeout')) {
        return [];
      }
      
      // Handle permission errors gracefully
      if (error?.message?.includes('Bluetooth permissions')) {
        return [];
      }
      
      throw error;
    }
  },

  async _listPairedPrintersInternal(): Promise<PairedPrinter[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const bt = getBt();
    if (!bt) {
      return [];
    }

    const ok = await ensureAndroidPermissions();
    if (!ok) {
      
      // Try direct Bluetooth operations without permission requests
      // Some devices allow basic operations without explicit permission grants
      try {
        
        // Try to check if Bluetooth is enabled without permission checks
        if (typeof bt.isBluetoothEnabled === "function") {
          const enabled = await bt.isBluetoothEnabled();
          
          if (enabled) {
            try {
              const bonded = await bt.getBondedDevices();
              
              const bondedMapped = (bonded || []).map((d: any) => ({
                id: d.address || d.id,
                name: d.name,
                address: d.address,
              }));
              
              if (bondedMapped.length > 0) {
                return bondedMapped;
              }
            } catch (bondedError) {
            }
          }
        }
        
        // Try alternative approach with getPairedDevices
        if (typeof bt.getPairedDevices === "function") {
          try {
            const paired = await bt.getPairedDevices();
            
            const pairedMapped = (paired || []).map((d: any) => ({
              id: d.address || d.id,
              name: d.name,
              address: d.address,
            }));
            
            if (pairedMapped.length > 0) {
              return pairedMapped;
            }
          } catch (pairedError) {
          }
        }
        
        // If all direct approaches fail, provide helpful guidance
        throw new Error("Bluetooth permissions not granted. Please manually enable Bluetooth permissions in Settings > Apps > Tablet App > Permissions > Nearby devices, then restart the app.");
        
      } catch (directError) {
        throw new Error("Bluetooth permissions not granted. Please manually enable Bluetooth permissions in Settings > Apps > Tablet App > Permissions > Nearby devices, then restart the app.");
      }
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

      const enabledAfter = await isEnabledFn();
      if (!enabledAfter) {
        throw new Error("Bluetooth is disabled");
      }
    }

    if (typeof bt.getBondedDevices !== "function") {
      throw new Error("Bluetooth module is missing getBondedDevices()");
    }
    const bonded = await bt.getBondedDevices();

    const bondedMapped = (bonded || []).map((d: any) => ({
      id: d.address || d.id,
      name: d.name,
      address: d.address,
    }));


    if (bondedMapped.length > 0) {
      return bondedMapped;
    }

    if (typeof bt.getPairedDevices === "function") {
      const paired = await bt.getPairedDevices();
      const pairedMapped = (paired || []).map((d: any) => ({
        id: d.address || d.id,
        name: d.name,
        address: d.address,
      }));
      return pairedMapped;
    }

    return [];
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
