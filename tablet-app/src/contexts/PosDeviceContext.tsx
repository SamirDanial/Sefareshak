import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthRole } from './AuthContext';
import { useOrganization } from './OrganizationContext';
import ApiService from '@/src/services/apiService';
import { posDeviceService, type PosDevice } from '@/src/services/posDeviceService';

const STORAGE_SELECTED_POS_DEVICE_ID = 'nf:selectedPosDeviceId';
const LEGACY_STORAGE_SELECTED_POS_DEVICE_ID = 'bellami:selectedPosDeviceId';

// Global refresh function that can be set by the POS Devices page
let globalRefreshDeviceList: (() => Promise<void>) | null = null;

export const setGlobalRefreshDeviceList = (fn: () => Promise<void>) => {
  globalRefreshDeviceList = fn;
};

export const callGlobalRefreshDeviceList = async () => {
  if (globalRefreshDeviceList) {
    try {
      await globalRefreshDeviceList();
    } catch (error) {
      console.error('Failed to refresh device list:', error);
    }
  }
};

interface PosDeviceContextType {
  selectedDevice: PosDevice | null;
  isLoading: boolean;
  error: string | null;
  refreshDevice: () => Promise<void>;
  forgetDevice: () => Promise<void>;
  setSelectedDeviceId: (deviceId: string | null) => Promise<void>;
}

const PosDeviceContext = createContext<PosDeviceContextType | undefined>(undefined);

export function usePosDevice() {
  const context = useContext(PosDeviceContext);
  if (context === undefined) {
    throw new Error('usePosDevice must be used within a PosDeviceProvider');
  }
  return context;
}

export function PosDeviceProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  
  const [selectedDevice, setSelectedDevice] = useState<PosDevice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSelectedDevice = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // One-time migration from legacy 'bellami:' key to 'nf:' key
      const legacyRaw = await AsyncStorage.getItem(LEGACY_STORAGE_SELECTED_POS_DEVICE_ID);
      if (legacyRaw !== null) {
        await Promise.all([
          AsyncStorage.setItem(STORAGE_SELECTED_POS_DEVICE_ID, legacyRaw),
          AsyncStorage.removeItem(LEGACY_STORAGE_SELECTED_POS_DEVICE_ID),
        ]);
      }

      // Get selected device ID from storage
      const raw = await AsyncStorage.getItem(STORAGE_SELECTED_POS_DEVICE_ID);
      const selectedDeviceId = (raw || '').trim();
      
      ApiService.setSelectedPosDeviceIdCache(selectedDeviceId.length > 0 ? selectedDeviceId : null);
      
      if (!selectedDeviceId) {
        setSelectedDevice(null);
        return;
      }

      // Get organization ID
      const orgId = (selectedOrganizationId || '').trim();
      if (!orgId) {
        setSelectedDevice(null);
        return;
      }

      // Load devices to find the selected one
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const devices = await posDeviceService.listForOrganization(orgId, token);
      const device = devices.find(d => d.id === selectedDeviceId) || null;
      
      setSelectedDevice(device);
    } catch (err) {
      console.error('Failed to load selected POS device:', err);
      setError(err instanceof Error ? err.message : 'Failed to load device');
      setSelectedDevice(null);
    } finally {
      setIsLoading(false);
    }
  }, [getToken, selectedOrganizationId]);

  const forgetDevice = async () => {
    try {
      setError(null);
      
      // Remove device ID from storage
      await AsyncStorage.removeItem(STORAGE_SELECTED_POS_DEVICE_ID);

      ApiService.setSelectedPosDeviceIdCache(null);
      
      // Clear selected device state
      setSelectedDevice(null);
    } catch (err) {
      console.error('Failed to forget POS device:', err);
      setError(err instanceof Error ? err.message : 'Failed to forget device');
    }
  };

  const setSelectedDeviceId = async (deviceId: string | null) => {
    try {
      setError(null);
      
      if (!deviceId) {
        await AsyncStorage.removeItem(STORAGE_SELECTED_POS_DEVICE_ID);

        ApiService.setSelectedPosDeviceIdCache(null);
        setSelectedDevice(null);
        return;
      }

      // Store the device ID
      await AsyncStorage.setItem(STORAGE_SELECTED_POS_DEVICE_ID, deviceId);

      ApiService.setSelectedPosDeviceIdCache(deviceId);
      
      // Get organization ID
      const orgId = (selectedOrganizationId || '').trim();
      if (!orgId) {
        setSelectedDevice(null);
        return;
      }

      // Load devices to find the selected one
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const devices = await posDeviceService.listForOrganization(orgId, token);
      const device = devices.find(d => d.id === deviceId) || null;
      
      setSelectedDevice(device);
    } catch (err) {
      console.error('Failed to set selected POS device:', err);
      setError(err instanceof Error ? err.message : 'Failed to set selected device');
    }
  };

  const refreshDevice = loadSelectedDevice;

  useEffect(() => {
    loadSelectedDevice();
  }, [loadSelectedDevice]);

  const value: PosDeviceContextType = {
    selectedDevice,
    isLoading,
    error,
    refreshDevice,
    forgetDevice,
    setSelectedDeviceId,
  };

  return (
    <PosDeviceContext.Provider value={value}>
      {children}
    </PosDeviceContext.Provider>
  );
}
