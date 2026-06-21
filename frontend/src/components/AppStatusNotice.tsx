import { cn } from "@/lib/utils";
import type { AppStatus } from "@/services/settingsService";
import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import { mdiAutoFix, mdiAlarmCheck, mdiWrench, mdiPower } from "@mdi/js";

const statusDetails: Record<
  AppStatus,
  {
    key: "live" | "comingSoon" | "maintenance" | "outOfService";
    iconPath: string;
    badgeClass: string;
    iconClass: string;
  }
> = {
  LIVE: {
    key: "live",
    iconPath: mdiAutoFix,
    badgeClass: "from-emerald-500/20 to-emerald-500/5 text-emerald-500 ring-emerald-500/30",
    iconClass: "text-emerald-600",
  },
  COMING_SOON: {
    key: "comingSoon",
    iconPath: mdiAlarmCheck,
    badgeClass: "from-amber-500/20 to-amber-500/5 text-amber-500 ring-amber-500/30",
    iconClass: "text-amber-600",
  },
  MAINTENANCE: {
    key: "maintenance",
    iconPath: mdiWrench,
    badgeClass: "from-blue-500/20 to-blue-500/5 text-blue-500 ring-blue-500/30",
    iconClass: "text-blue-600",
  },
  OUT_OF_SERVICE: {
    key: "outOfService",
    iconPath: mdiPower,
    badgeClass: "from-rose-500/20 to-rose-500/5 text-rose-500 ring-rose-500/30",
    iconClass: "text-rose-600",
  },
};

interface AppStatusNoticeProps {
  status: AppStatus;
  className?: string;
}

export default function AppStatusNotice({
  status,
  className,
}: AppStatusNoticeProps) {
  const { t } = useTranslation();
  const details = statusDetails[status] ?? statusDetails.LIVE;

  return (
    <div
      className={cn(
        "w-full rounded-3xl border border-pink-200/60 bg-gradient-to-b from-white/90 to-pink-50/40 p-10 text-center shadow-lg shadow-pink-200/30 dark:border-pink-900/30 dark:from-neutral-900/90 dark:to-pink-950/20 dark:shadow-pink-950/20",
        className
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className={cn(
            "rounded-full p-5 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-neutral-950 bg-gradient-to-br",
            details.badgeClass
          )}
        >
          <Icon path={details.iconPath} size={1.67} className={details.iconClass} />
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {t("appStatus.bannerLabel")}
          </p>
          <h2 className="text-3xl font-bold">
            {t(`appStatus.states.${details.key}.title`)}
          </h2>
        </div>
        <p className="text-base text-muted-foreground max-w-xl">
          {t(`appStatus.states.${details.key}.description`)}
        </p>
        <p className="text-sm font-medium text-pink-500 dark:text-pink-300">
          {t("appStatus.retry")}
        </p>
      </div>
    </div>
  );
}

