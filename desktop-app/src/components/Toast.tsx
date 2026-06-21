import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle, X, Info, AlertCircle } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  onClick?: (() => void) | null;
}

interface ToastProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastProps> = ({ toast, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation
    setTimeout(() => setIsVisible(true), 10);

    // Auto remove after duration
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onRemove(toast.id), 300); // Wait for fade out animation
    }, toast.duration || 3000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return <CheckCircle2 style={{ height: "20px", width: "20px", color: "#10b981" }} />;
      case "error":
        return <XCircle style={{ height: "20px", width: "20px", color: "#ef4444" }} />;
      case "warning":
        return <AlertCircle style={{ height: "20px", width: "20px", color: "#f59e0b" }} />;
      case "info":
        return <Info style={{ height: "20px", width: "20px", color: "#3b82f6" }} />;
      default:
        return null;
    }
  };

  const getBackgroundColor = () => {
    switch (toast.type) {
      case "success":
        return "#d1fae5";
      case "error":
        return "#fee2e2";
      case "warning":
        return "#fef3c7";
      case "info":
        return "#dbeafe";
      default:
        return "#f3f4f6";
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case "success":
        return "#10b981";
      case "error":
        return "#ef4444";
      case "warning":
        return "#f59e0b";
      case "info":
        return "#3b82f6";
      default:
        return "#e5e7eb";
    }
  };

  const getTextColor = () => {
    switch (toast.type) {
      case "success":
        return "#065f46";
      case "error":
        return "#991b1b";
      case "warning":
        return "#92400e";
      case "info":
        return "#1e40af";
      default:
        return "#111827";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        backgroundColor: getBackgroundColor(),
        border: `1px solid ${getBorderColor()}`,
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        minWidth: "300px",
        maxWidth: "500px",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateX(0)" : "translateX(100%)",
        transition: "all 0.3s ease-in-out",
        zIndex: 10000,
        cursor: toast.onClick ? "pointer" : "default",
      }}
      onClick={() => {
        if (toast.onClick) {
          try {
            toast.onClick();
          } catch {
            // ignore
          }
        }
      }}
    >
      {getIcon()}
      <p
        style={{
          flex: 1,
          margin: 0,
          fontSize: "14px",
          fontWeight: "500",
          color: getTextColor(),
        }}
      >
        {toast.message}
      </p>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(() => onRemove(toast.id), 300);
        }}
        style={{
          padding: "4px",
          border: "none",
          borderRadius: "4px",
          backgroundColor: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <X style={{ height: "16px", width: "16px", color: getTextColor() }} />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onRemove,
}) => {
  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        right: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        zIndex: 10000,
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} style={{ pointerEvents: "auto" }}>
          <ToastItem toast={toast} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
};

// Toast manager hook
let toastIdCounter = 0;
const toastListeners: Set<(toasts: Toast[]) => void> = new Set();
let toasts: Toast[] = [];

const notifyListeners = () => {
  toastListeners.forEach((listener) => listener([...toasts]));
};

export const toast = {
  success: (message: string, duration?: number) => {
    const id = `toast-${++toastIdCounter}`;
    toasts = [...toasts, { id, message, type: "success", duration, onClick: null }];
    notifyListeners();
  },
  error: (message: string, duration?: number) => {
    const id = `toast-${++toastIdCounter}`;
    toasts = [...toasts, { id, message, type: "error", duration, onClick: null }];
    notifyListeners();
  },
  info: (message: string, duration?: number) => {
    const id = `toast-${++toastIdCounter}`;
    toasts = [...toasts, { id, message, type: "info", duration, onClick: null }];
    notifyListeners();
  },
  warning: (message: string, duration?: number) => {
    const id = `toast-${++toastIdCounter}`;
    toasts = [...toasts, { id, message, type: "warning", duration, onClick: null }];
    notifyListeners();
  },
  successAction: (message: string, onClick: () => void, duration?: number) => {
    const id = `toast-${++toastIdCounter}`;
    toasts = [...toasts, { id, message, type: "success", duration, onClick }];
    notifyListeners();
  },
  errorAction: (message: string, onClick: () => void, duration?: number) => {
    const id = `toast-${++toastIdCounter}`;
    toasts = [...toasts, { id, message, type: "error", duration, onClick }];
    notifyListeners();
  },
  infoAction: (message: string, onClick: () => void, duration?: number) => {
    const id = `toast-${++toastIdCounter}`;
    toasts = [...toasts, { id, message, type: "info", duration, onClick }];
    notifyListeners();
  },
  warningAction: (message: string, onClick: () => void, duration?: number) => {
    const id = `toast-${++toastIdCounter}`;
    toasts = [...toasts, { id, message, type: "warning", duration, onClick }];
    notifyListeners();
  },
  remove: (id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  },
};

export const useToast = () => {
  const [toastList, setToastList] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (newToasts: Toast[]) => {
      setToastList(newToasts);
    };
    toastListeners.add(listener);
    setToastList([...toasts]);

    return () => {
      toastListeners.delete(listener);
    };
  }, []);

  return {
    toasts: toastList,
    removeToast: toast.remove,
  };
};

