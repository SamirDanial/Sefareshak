import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Icon from "@mdi/react";
import { mdiTrendingUp, mdiTrendingDown } from "@mdi/js";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  iconPath: string;
  iconColor?: string;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  change,
  changeLabel,
  iconPath,
  iconColor = "text-muted-foreground",
}) => {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;
  const isNeutral = change === 0 || change === undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon path={iconPath} size={0.67} className={iconColor} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <div className="flex items-center text-xs text-muted-foreground">
            {isPositive && (
              <Icon path={mdiTrendingUp} size={0.5} className="text-green-500 mr-1" />
            )}
            {isNegative && (
              <Icon path={mdiTrendingDown} size={0.5} className="text-red-500 mr-1" />
            )}
            {isNeutral && <span className="h-3 w-3 mr-1">—</span>}
            <span
              className={
                isPositive
                  ? "text-green-500"
                  : isNegative
                  ? "text-red-500"
                  : "text-muted-foreground"
              }
            >
              {isPositive ? "+" : ""}
              {change}%
            </span>
            {changeLabel && <span className="ml-1">{changeLabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StatsCard;
