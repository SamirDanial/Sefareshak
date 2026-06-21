import { Platform, PermissionsAndroid } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

let BleManager: any = null;
try {
  const mod = require("react-native-ble-plx");
  BleManager = mod?.BleManager ?? mod?.default?.BleManager ?? mod?.default ?? null;
} catch {
  BleManager = null;
}

export type BlePrinter = {
  id: string;
  name?: string | null;
};

const STORAGE_KEY_DEVICE = "lastBlePrinterDeviceId";

const ensureAndroidPermissions = async () => {
  if (Platform.OS !== "android") return true;

  const perms: string[] = [];

  perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);

  perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);

  const results = await PermissionsAndroid.requestMultiple(perms as any);
  return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
};

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

const getManager = () => {
  if (!BleManager) return null;
  try {
    return new BleManager();
  } catch {
    return null;
  }
};

export const blePrinterService = {
  isAvailable(): boolean {
    return Platform.OS === "android" && Boolean(BleManager);
  },

  async getLastPrinterDeviceId(): Promise<string | null> {
    try {
      return (await AsyncStorage.getItem(STORAGE_KEY_DEVICE)) || null;
    } catch {
      return null;
    }
  },

  async setLastPrinterDeviceId(id: string | null): Promise<void> {
    try {
      if (!id) {
        await AsyncStorage.removeItem(STORAGE_KEY_DEVICE);
        return;
      }
      await AsyncStorage.setItem(STORAGE_KEY_DEVICE, id);
    } catch {
    }
  },

  async scanForPrinters(timeoutMs: number = 6000): Promise<BlePrinter[]> {
    if (!this.isAvailable()) return [];

    const ok = await ensureAndroidPermissions();
    if (!ok) {
      throw new Error("Bluetooth permission denied");
    }

    const manager = getManager();
    if (!manager) {
      throw new Error("BLE manager not available");
    }

    const devices = new Map<string, BlePrinter>();

    return await new Promise<BlePrinter[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          manager.stopDeviceScan();
        } catch {
        }
        resolve(Array.from(devices.values()));
      }, timeoutMs);

      try {
        manager.startDeviceScan(null, { allowDuplicates: false }, (error: any, device: any) => {
          if (error) {
            clearTimeout(timer);
            try {
              manager.stopDeviceScan();
            } catch {
            }
            reject(new Error(error?.message || "BLE scan failed"));
            return;
          }
          if (!device?.id) return;

          devices.set(device.id, {
            id: device.id,
            name: device.name,
          });
        });
      } catch (e: any) {
        clearTimeout(timer);
        reject(new Error(e?.message || "BLE scan failed"));
      }
    });
  },

  async printBytes(deviceId: string, bytes: Uint8Array): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error("BLE printing is not available in this build");
    }

    const ok = await ensureAndroidPermissions();
    if (!ok) {
      throw new Error("Bluetooth permission denied");
    }

    const manager = getManager();
    if (!manager) {
      throw new Error("BLE manager not available");
    }

    const b64 = toBase64(bytes);

    let device: any = null;
    try {
      device = await manager.connectToDevice(deviceId, { autoConnect: true });
      device = await device.discoverAllServicesAndCharacteristics();

      const services = await device.services();
      for (const svc of services || []) {
        const chars = await svc.characteristics();
        for (const c of chars || []) {
          const canWrite = Boolean(c.isWritableWithResponse || c.isWritableWithoutResponse);
          if (!canWrite) continue;

          if (c.isWritableWithoutResponse && typeof device.writeCharacteristicWithoutResponseForService === "function") {
            await device.writeCharacteristicWithoutResponseForService(svc.uuid, c.uuid, b64);
            await this.setLastPrinterDeviceId(deviceId);
            return;
          }

          if (c.isWritableWithResponse && typeof device.writeCharacteristicWithResponseForService === "function") {
            await device.writeCharacteristicWithResponseForService(svc.uuid, c.uuid, b64);
            await this.setLastPrinterDeviceId(deviceId);
            return;
          }
        }
      }

      throw new Error("No writable BLE characteristic found on this device");
    } finally {
      try {
        if (device && typeof device.cancelConnection === "function") {
          await device.cancelConnection();
        }
      } catch {
      }
      try {
        if (typeof manager.destroy === "function") {
          manager.destroy();
        }
      } catch {
      }
    }
  },
};
