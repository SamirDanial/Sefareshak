import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface UnseenStatusChangesContextType {
  count: number;
  refreshCount: () => Promise<void>;
}

const UnseenStatusChangesContext = createContext<
  UnseenStatusChangesContextType | undefined
>(undefined);

export const useUnseenStatusChanges = (): UnseenStatusChangesContextType => {
  const context = useContext(UnseenStatusChangesContext);
  if (!context) {
    throw new Error(
      "useUnseenStatusChanges must be used within UnseenStatusChangesProvider"
    );
  }
  return context;
};

interface UnseenStatusChangesProviderProps {
  children: ReactNode;
}

export const UnseenStatusChangesProvider: React.FC<
  UnseenStatusChangesProviderProps
> = ({ children }) => {
  const [count, setCount] = useState(0);

  const refreshCount = async () => {
    try {
      const stored = await AsyncStorage.getItem("unseenStatusChanges");
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        setCount(ids.length);
      } else {
        setCount(0);
      }
    } catch (error) {
      console.error("Error loading unseen status changes count:", error);
      setCount(0);
    }
  };

  // Load initial count
  useEffect(() => {
    refreshCount();
  }, []);

  // Poll for changes every second (since AsyncStorage doesn't have events)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshCount();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <UnseenStatusChangesContext.Provider value={{ count, refreshCount }}>
      {children}
    </UnseenStatusChangesContext.Provider>
  );
};
