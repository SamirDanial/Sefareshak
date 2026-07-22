import { Link, type To } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import { mdiArrowLeft, mdiArrowRight } from "@mdi/js";
import { cn } from "@/lib/utils";
import { useDirection } from "@/utils/direction";

interface BackButtonProps {
  to?: To;
  onClick?: () => void;
  className?: string;
  iconClassName?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
  type?: "button" | "submit" | "reset";
}

export default function BackButton({
  to,
  onClick,
  className,
  iconClassName,
  ariaLabel,
  children,
  type = "button",
}: BackButtonProps) {
  const { t } = useTranslation();
  const { isRtl } = useDirection();

  const arrowPath = isRtl ? mdiArrowRight : mdiArrowLeft;
  const label = ariaLabel || t("common.back", { defaultValue: "Back" });

  const baseClassName = cn(
    "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-pink-400/70",
    className
  );

  const icon = (
    <Icon
      path={arrowPath}
      size={0.67}
      className={cn("text-white shrink-0", iconClassName)}
    />
  );

  if (to) {
    return (
      <Link
        to={to}
        className={baseClassName}
        aria-label={label}
        onClick={onClick}
      >
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      className={baseClassName}
      aria-label={label}
    >
      {icon}
      {children}
    </button>
  );
}
