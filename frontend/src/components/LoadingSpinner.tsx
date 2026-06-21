import React from "react";

interface LoadingSpinnerProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = "Loading...",
  size = "md",
}) => {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center space-y-4">
        <div
          className={`animate-spin rounded-full border-b-2 border-pink-500 ${sizeClasses[size]}`}
        ></div>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
};

export default LoadingSpinner;
