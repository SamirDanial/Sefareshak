import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AppMode = 'pos' | 'management' | null;

interface AppModeContextType {
  appMode: AppMode;
  isPosOnlyMode: boolean;
  setAppMode: (mode: AppMode) => Promise<void>;
  exitPosMode: () => Promise<void>;
}

const AppModeContext = createContext<AppModeContextType | null>(null);

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [appMode, setAppModeState] = useState<AppMode>(null);

  useEffect(() => {
    AsyncStorage.getItem('appMode').then((value) => {
      setAppModeState(value as AppMode);
    }).catch(() => {});
  }, []);

  const setAppMode = async (mode: AppMode) => {
    if (mode === null) {
      await AsyncStorage.removeItem('appMode');
    } else {
      await AsyncStorage.setItem('appMode', mode);
    }
    setAppModeState(mode);
  };

  const exitPosMode = async () => {
    await AsyncStorage.setItem('appMode', 'management');
    setAppModeState('management');
  };

  const isPosOnlyMode = appMode === 'pos';

  return (
    <AppModeContext.Provider value={{ appMode, isPosOnlyMode, setAppMode, exitPosMode }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error('useAppMode must be used within AppModeProvider');
  }
  return context;
}
