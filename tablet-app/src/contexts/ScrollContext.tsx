import React, { createContext, useContext, useState, useCallback } from 'react';

interface ScrollContextType {
  isScrollingDown: boolean;
  isAtTop: boolean;
  setScrollDirection: (direction: 'up' | 'down') => void;
  setScrollPosition: (offset: number) => void;
}

const ScrollContext = createContext<ScrollContextType | undefined>(undefined);

export function ScrollProvider({ children }: { children: React.ReactNode }) {
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  const setScrollDirection = useCallback((direction: 'up' | 'down') => {
    setIsScrollingDown(direction === 'down');
  }, []);

  const setScrollPosition = useCallback((offset: number) => {
    setIsAtTop(offset <= 10); // Consider at top if within 10px
    setLastScrollY(offset);
  }, []);

  return (
    <ScrollContext.Provider
      value={{
        isScrollingDown,
        isAtTop,
        setScrollDirection,
        setScrollPosition,
      }}
    >
      {children}
    </ScrollContext.Provider>
  );
}

export function useScroll() {
  const context = useContext(ScrollContext);
  if (context === undefined) {
    throw new Error('useScroll must be used within a ScrollProvider');
  }
  return context;
}

