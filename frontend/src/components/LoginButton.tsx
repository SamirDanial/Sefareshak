import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Icon from "@mdi/react";
import { mdiLogin, mdiAccount, mdiLogout, mdiCog, mdiCalendar } from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "@/lib/permissions";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { reservationService } from "@/services/reservationService";
import { useBranch } from "@/contexts/BranchContext";
import { useSettings } from "@/contexts/SettingsContext";
import type { AppStatus } from "@/services/settingsService";

export default function LoginButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reservationsEnabled, setReservationsEnabled] = useState(false);
  const { branch } = useBranch();
  const { settings } = useSettings();
  const appStatus = (settings?.appStatus || "LIVE") as AppStatus;
  const isAppUnavailable = appStatus !== "LIVE";

  // Check if Clerk is available
  const clerkPublishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const isValidClerkKey =
    clerkPublishableKey &&
    clerkPublishableKey.startsWith("pk_") &&
    clerkPublishableKey !== "pk_test_your_publishable_key_here";

  // If Clerk is not available, don't render the login button
  if (!isValidClerkKey) {
    return null;
  }

  const { isSignedIn, user, userRole, orgRole, signIn, signOut, getToken } = useAuth();
  const { canAny, isLoading: permissionsLoading } = usePermissions();

  const signedIn = Boolean(isSignedIn || user);

  const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

  const canSeeAdminPanel =
    userRole === "ADMIN" &&
    !permissionsLoading &&
    (isOrgAdmin ||
      canAny(
        [
          RESOURCES.DASHBOARD,
          RESOURCES.ORDERS,
          RESOURCES.MENU,
          RESOURCES.CATEGORIES,
          RESOURCES.ADDONS,
          RESOURCES.DECLARATIONS,
          RESOURCES.MEALS,
          RESOURCES.RESERVATIONS,
          RESOURCES.TABLES,
          RESOURCES.ZONES,
          RESOURCES.BRANCHES,
          RESOURCES.SETTINGS,
          RESOURCES.HERO_SECTIONS,
          RESOURCES.PUSH_NOTIFICATIONS,
          RESOURCES.POLICIES,
          RESOURCES.NOTIFICATIONS,
          RESOURCES.ANALYTICS,
          RESOURCES.ANALYTICS_REVENUE,
          RESOURCES.ANALYTICS_CATEGORY_INSIGHTS,
          RESOURCES.ANALYTICS_RESERVATION,
          RESOURCES.REPORTS,
          RESOURCES.USERS,
          RESOURCES.ROLES,
        ].map((resource) => ({ resource, action: ACTIONS.VIEW }))
      ));

  // Load reservation settings
  useEffect(() => {
    const loadReservationSettings = async () => {
      try {
        const token = await getToken();
        if (token) {
          const settings = await reservationService.getSettings(token, branch?.id);
          setReservationsEnabled(settings.isEnabled === true);
        }
      } catch (error) {
        console.error("Error loading reservation settings:", error);
        setReservationsEnabled(false);
      }
    };

    if (signedIn) {
      loadReservationSettings();
    }
  }, [signedIn, getToken, branch?.id]);

  if (signedIn) {
    // Get user initials for fallback
    const getInitials = () => {
      if (user?.firstName && user?.lastName) {
        return `${user.firstName.charAt(0)}${user.lastName.charAt(
          0
        )}`.toUpperCase();
      }
      if (user?.firstName) {
        return user.firstName.charAt(0).toUpperCase();
      }
      if (user?.emailAddresses?.[0]?.emailAddress) {
        return user.emailAddresses[0].emailAddress.charAt(0).toUpperCase();
      }
      return "U";
    };

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 w-9 rounded-full p-0 hover:bg-neutral-800/50 transition-all duration-200"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={user?.imageUrl}
                alt={user?.firstName || "User"}
              />
              <AvatarFallback className="bg-pink-500 text-white text-sm font-medium">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-auto min-w-fit bg-neutral-900 border-neutral-700"
        >
          <DropdownMenuItem
            onClick={() => navigate("/profile")}
            className="text-neutral-200 hover:text-pink-400 hover:bg-pink-500/10 cursor-pointer transition-colors whitespace-nowrap"
          >
            <Icon path={mdiAccount} size={0.67} className="mr-2 flex-shrink-0" />
            {t("common.profile")}
          </DropdownMenuItem>
          {reservationsEnabled ? (
            <DropdownMenuItem
              onClick={(e) => {
                if (isAppUnavailable) e.preventDefault();
                else navigate("/reservations/book");
              }}
              className={`text-neutral-200 hover:text-pink-400 hover:bg-pink-500/10 transition-colors whitespace-nowrap ${
                isAppUnavailable
                  ? "pointer-events-none opacity-40 cursor-not-allowed"
                  : "cursor-pointer"
              }`}
            >
              <Icon path={mdiCalendar} size={0.67} className="mr-2 flex-shrink-0" />
              {t("common.bookReservation")}
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuItem
            onClick={() => navigate("/reservations/my-reservations")}
            className="text-neutral-200 hover:text-pink-400 hover:bg-pink-500/10 cursor-pointer transition-colors whitespace-nowrap"
          >
            <Icon path={mdiCalendar} size={0.67} className="mr-2 flex-shrink-0" />
            {t("common.myReservations")}
          </DropdownMenuItem>
          {canSeeAdminPanel && (
            <DropdownMenuItem
              onClick={() => navigate("/admin")}
              className="text-neutral-200 hover:text-pink-400 hover:bg-pink-500/10 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Icon path={mdiCog} size={0.67} className="mr-2 flex-shrink-0" />
              {t("common.adminPanel")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={signOut}
            className="text-neutral-200 hover:text-pink-400 hover:bg-pink-500/10 cursor-pointer transition-colors whitespace-nowrap"
          >
            <Icon path={mdiLogout} size={0.67} className="mr-2 flex-shrink-0" />
            {t("common.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button
      onClick={signIn}
      variant="ghost"
      className="h-9 px-4 text-pink-500 hover:text-pink-400 hover:bg-pink-500/10 transition-all duration-200"
      title={t("common.login")}
    >
      <Icon path={mdiLogin} size={0.67} className="mr-2" />
      <span className="text-sm font-medium">{t("common.login")}</span>
    </Button>
  );
}
