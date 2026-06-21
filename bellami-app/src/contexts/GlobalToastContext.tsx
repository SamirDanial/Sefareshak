import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { Toast } from "@/components/Toast";

interface ToastData {
  message: string;
  type: "success" | "error" | "info";
  id: string;
}

interface ToastContextType {
  showToast: (message: string, type: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useGlobalToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useGlobalToast must be used within GlobalToastProvider");
  }
  return context;
};

interface GlobalToastProviderProps {
  children: ReactNode;
}

export const GlobalToastProvider: React.FC<GlobalToastProviderProps> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info") => {
      const id = Date.now().toString() + Math.random().toString();
      setToasts((prev) => [...prev, { message, type, id }]);

      // Auto-remove after animation completes (~2.8 seconds total)
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, 3000);
    },
    []
  );

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Render toasts with stacking */}
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          visible={true}
          onHide={() => hideToast(toast.id)}
          topOffset={60 + index * 80} // Stack toasts vertically
        />
      ))}
    </ToastContext.Provider>
  );
};
