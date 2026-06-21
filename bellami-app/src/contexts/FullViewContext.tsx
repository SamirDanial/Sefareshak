import React, { createContext, useContext, useState, useCallback } from 'react';

interface FullViewContextType {
  isFullView: boolean;
  setIsFullView: (value: boolean) => void;
}

const FullViewContext = createContext<FullViewContextType | undefined>(undefined);

export function FullViewProvider({ children }: { children: React.ReactNode }) {
  const [isFullView, setIsFullView] = useState(false);

  return (
    <FullViewContext.Provider
      value={{
        isFullView,
        setIsFullView,
      }}
    >
      {children}
    </FullViewContext.Provider>
  );
}

export function useFullView() {
  const context = useContext(FullViewContext);
  if (context === undefined) {
    throw new Error('useFullView must be used within a FullViewProvider');
  }
  return context;
}
