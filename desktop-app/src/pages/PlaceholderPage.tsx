import React from "react";
import { useTranslation } from "react-i18next";
import PageHeader from "../components/PageHeader";

const PlaceholderPage: React.FC<{ titleKey: string }> = ({ titleKey }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        minHeight: "calc(100vh - 72px)",
        padding: "24px",
        backgroundColor: "#f9fafb",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          padding: "24px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          maxWidth: "900px",
        }}
      >
        <PageHeader title={t(titleKey)} />
      </div>
    </div>
  );
};

export default PlaceholderPage;
