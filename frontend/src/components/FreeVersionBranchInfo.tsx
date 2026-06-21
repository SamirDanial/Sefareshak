import { Card, CardContent } from "@/components/ui/card";
import Icon from "@mdi/react";
import { mdiPhone, mdiMapMarker, mdiEmail, mdiClock, mdiChevronDown, mdiChevronUp } from "@mdi/js";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import type { Branch } from "@/services/branchService";
import { ServingHoursService, type DeliveryHours, type ServingHoursStatus } from "@/services/servingHoursService";
import { formatGermanAddress } from "@/utils/addressFormatter";

interface FreeVersionBranchInfoProps {
  branch: Branch;
}

export function FreeVersionBranchInfo({ branch }: FreeVersionBranchInfoProps) {
  const { t } = useTranslation();
  const [servingHours, setServingHours] = useState<DeliveryHours | null>(null);
  const [servingHoursStatus, setServingHoursStatus] = useState<ServingHoursStatus | null>(null);
  const [servingHoursLoading, setServingHoursLoading] = useState(true);
  const [showFullWeek, setShowFullWeek] = useState(false);

  useEffect(() => {
    const fetchServingHours = async () => {
      try {
        setServingHoursLoading(true);
        const response = await ServingHoursService.getServingHours(branch.id);
        setServingHours(response.data.hours);
        setServingHoursStatus(response.data.currentStatus);
      } catch (error) {
        console.error("Error fetching serving hours:", error);
      } finally {
        setServingHoursLoading(false);
      }
    };

    fetchServingHours();
  }, [branch.id]);

  // Get contact information with fallback to organization settings
  const phoneNumber = branch.businessPhone || branch.organization?.settings?.businessPhone;
  const emailAddress = branch.businessEmail || branch.organization?.settings?.businessEmail;
  const address = formatGermanAddress(branch.address || branch.businessAddress || branch.organization?.settings?.businessAddress);
  
  // Get coordinates with fallback to organization settings
  const latitude = branch.latitude ? Number(branch.latitude) : 
                   (branch.organization?.settings?.latitude ? Number(branch.organization.settings.latitude) : null);
  const longitude = branch.longitude ? Number(branch.longitude) : 
                    (branch.organization?.settings?.longitude ? Number(branch.organization.settings.longitude) : null);
  
  // Create phone link
  const phoneLink = phoneNumber ? `tel:${phoneNumber}` : null;
  
  // Create map link using coordinates if available, otherwise use address
  const mapLink = (() => {
    if (latitude && longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    }
    if (address) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    }
    return null;
  })();

  const formatTimeEu = (time: string | undefined): string => {
    if (!time) return "";
    const trimmed = time.trim();
    const m12 = trimmed.match(/^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*$/i);
    if (m12) {
      const rawH = Number(m12[1]);
      const rawM = Number(m12[2] ?? "0");
      const period = m12[3].toUpperCase();
      if (Number.isFinite(rawH) && Number.isFinite(rawM)) {
        let h = rawH % 12;
        if (period === "PM") h += 12;
        return `${h.toString().padStart(2, "0")}:${rawM.toString().padStart(2, "0")}`;
      }
      return trimmed;
    }

    const m24 = trimmed.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
    if (m24) {
      const h = Number(m24[1]);
      const m = Number(m24[2]);
      if (Number.isFinite(h) && Number.isFinite(m)) {
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      }
    }

    return trimmed;
  };

  const renderServingHours = (dayHours: { isOff: boolean; open?: string; close?: string; periods?: Array<{ open: string; close: string }> }): React.ReactNode => {
    if (dayHours.isOff) {
      return <span className="text-inherit">{t("home.servingHours.closed")}</span>;
    }
    
    if (dayHours.periods && Array.isArray(dayHours.periods) && dayHours.periods.length > 0) {
      return (
        <div className="flex flex-col gap-1.5">
          {dayHours.periods.map((p, index) => (
            <span key={index} className="block text-inherit leading-tight">
              {formatTimeEu(p.open)} - {formatTimeEu(p.close)}
            </span>
          ))}
        </div>
      );
    }
    
    if (!dayHours.open || !dayHours.close) {
      return <span className="text-inherit">{t("home.servingHours.open24h")}</span>;
    }
    return <span className="text-inherit">{formatTimeEu(dayHours.open)} - {formatTimeEu(dayHours.close)}</span>;
  };

  const getZonedDayIndex0 = (): number => {
    const iso = new Date().getDay();
    return iso;
  };

  const getDayName = (dayIndex: number): keyof DeliveryHours => {
    const days: (keyof DeliveryHours)[] = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    return days[dayIndex];
  };

  const getTodayHours = () => {
    if (!servingHours) return null;
    const dayIndex = getZonedDayIndex0();
    const dayName = getDayName(dayIndex);
    return servingHours[dayName];
  };

  const getServingHoursMessage = (status: ServingHoursStatus): string => {
    if (status.isOff) {
      if (status.nextOpenDay && status.nextOpenTimeString) {
        return t("home.servingHours.closedTodayNextDay", {
          day: status.nextOpenDay,
          time: status.nextOpenTimeString,
        });
      }
      return t("home.servingHours.closedToday");
    }

    if (status.hoursUntilOpen !== undefined && status.minutesUntilOpen !== undefined) {
      const parts: string[] = [];
      
      if (status.hoursUntilOpen > 0) {
        const hourText = status.hoursUntilOpen === 1 
          ? t("home.servingHours.hour", { count: 1 })
          : t("home.servingHours.hours", { count: status.hoursUntilOpen });
        parts.push(`${status.hoursUntilOpen} ${hourText}`);
      }
      
      if (status.minutesUntilOpen > 0) {
        const minuteText = status.minutesUntilOpen === 1
          ? t("home.servingHours.minute", { count: 1 })
          : t("home.servingHours.minutes", { count: status.minutesUntilOpen });
        parts.push(`${status.minutesUntilOpen} ${minuteText}`);
      }

      let message = t("home.servingHours.currentlyClosed");
      if (parts.length > 0) {
        message += " " + t("home.servingHours.willOpenIn", {
          time: parts.join(" " + t("home.servingHours.and") + " "),
        });
      } else if (status.minutesUntilOpen === 0) {
        message += " " + t("home.servingHours.willOpenSoon");
      }

      if (status.nextOpenTimeString) {
        message += " " + t("home.servingHours.orderWillBeServed", {
          time: status.nextOpenTimeString,
        });
      }

      return message;
    }

    return status.message || t("home.servingHours.closed");
  };

  return (
    <Card className="bg-[#171717] border-[#262626]">
      <CardContent className="p-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            {branch.name || t("home.freeVersionBranchInfo.defaultTitle", { defaultValue: "Branch Information" })}
          </h2>
          <p className="text-gray-400">
            {t("home.freeVersionBranchInfo.subtitle", { defaultValue: "Contact us for more information" })}
          </p>
        </div>

        <div className="space-y-4">
          {/* Phone Number */}
          {phoneNumber && phoneLink && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
              <Icon path={mdiPhone} size={0.8} className="text-pink-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-400 mb-1">
                  {t("home.freeVersionBranchInfo.phone", { defaultValue: "Phone" })}
                </p>
                <a
                  href={phoneLink}
                  className="text-white font-medium break-all hover:text-pink-400 transition-colors"
                  onClick={() => {
                    // Track click for analytics if needed
                    console.log('Phone number clicked:', phoneNumber);
                  }}
                >
                  {phoneNumber}
                </a>
              </div>
            </div>
          )}

          {/* Address */}
          {address && mapLink && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
              <Icon path={mdiMapMarker} size={0.8} className="text-pink-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-400 mb-1">
                  {t("home.freeVersionBranchInfo.address", { defaultValue: "Address" })}
                </p>
                <a
                  href={mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white font-medium wrap-break-word hover:text-pink-400 transition-colors"
                  onClick={() => {
                    // Track click for analytics if needed
                    console.log('Address clicked, opening map:', mapLink);
                  }}
                >
                  {address}
                </a>
                {(latitude && longitude) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {latitude.toFixed(6)}, {longitude.toFixed(6)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Email */}
          {emailAddress && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
              <Icon path={mdiEmail} size={0.8} className="text-pink-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-400 mb-1">
                  {t("home.freeVersionBranchInfo.email", { defaultValue: "Email" })}
                </p>
                <a
                  href={`mailto:${emailAddress}`}
                  className="text-white font-medium break-all hover:text-pink-400 transition-colors"
                  onClick={() => {
                    // Track click for analytics if needed
                    console.log('Email clicked:', emailAddress);
                  }}
                >
                  {emailAddress}
                </a>
              </div>
            </div>
          )}

          {/* Working Hours */}
          {!servingHoursLoading && servingHours && servingHoursStatus && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon path={mdiClock} size={0.83} className="text-pink-500" />
                  <h3 className="font-semibold text-lg text-white">
                    {t("home.servingHours.title")}
                  </h3>
                </div>
                <button
                  onClick={() => setShowFullWeek(!showFullWeek)}
                  className="text-pink-500 hover:text-pink-400 transition-colors flex items-center gap-1 text-sm"
                >
                  {showFullWeek ? (
                    <>
                      <Icon path={mdiChevronUp} size={0.67} />
                      {t("home.servingHours.hideWeek")}
                    </>
                  ) : (
                    <>
                      <Icon path={mdiChevronDown} size={0.67} />
                      {t("home.servingHours.showWeek")}
                    </>
                  )}
                </button>
              </div>

              {/* Today's Hours */}
              {getTodayHours() && (
                (() => {
                  const isOpen = Boolean(servingHoursStatus?.isOpen);
                  return (
                    <div className={`flex items-center justify-between p-3 rounded-lg ${isOpen ? "bg-green-500/10" : "bg-red-500/10"}`}>
                      <div className="flex-1">
                        <p className="font-medium text-sm text-gray-400 mb-1">
                          {t("home.servingHours.today")}
                        </p>
                        <div className={`text-lg font-bold ${isOpen ? "text-green-500" : "text-red-500"}`}>
                          {renderServingHours(getTodayHours()!)}
                        </div>
                        {!isOpen && (
                          <p className="text-xs text-gray-400 mt-1">
                            {getServingHoursMessage(servingHoursStatus)}
                          </p>
                        )}
                      </div>
                      <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${isOpen ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}>
                        {isOpen ? t("home.servingHours.open") : t("home.servingHours.closed")}
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Full Week Hours */}
              {showFullWeek && (
                <div className="space-y-2 mt-3">
                  {[
                    { key: "monday", label: t("home.servingHours.monday") },
                    { key: "tuesday", label: t("home.servingHours.tuesday") },
                    { key: "wednesday", label: t("home.servingHours.wednesday") },
                    { key: "thursday", label: t("home.servingHours.thursday") },
                    { key: "friday", label: t("home.servingHours.friday") },
                    { key: "saturday", label: t("home.servingHours.saturday") },
                    { key: "sunday", label: t("home.servingHours.sunday") },
                  ].map((day) => {
                    const dayHours = servingHours[day.key as keyof DeliveryHours];
                    const isToday = getDayName(getZonedDayIndex0()) === day.key;
                    return (
                      <div
                        key={day.key}
                        className={`flex items-start justify-between p-2 rounded-md min-h-[44px] ${isToday ? "bg-pink-500/10" : ""}`}
                      >
                        <span className={`font-medium flex-1 mr-3 ${isToday ? "text-pink-500 font-semibold" : "text-gray-300"}`}>
                          {day.label}
                        </span>
                        <div className={`text-sm text-right flex-1 max-w-[60%] ${isToday ? "text-pink-500 font-semibold" : "text-gray-400"}`}>
                          {renderServingHours(dayHours)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* No contact information available */}
          {!phoneNumber && !address && !emailAddress && (
            <div className="text-center py-8">
              <Icon path={mdiPhone} size={2} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">
                {t("home.freeVersionBranchInfo.noContactInfo", { defaultValue: "No contact information available" })}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            {t("home.freeVersionBranchInfo.freeVersionNotice", { defaultValue: "This branch is using our free version. For full menu and ordering features, please contact us directly." })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
