import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useClerk } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useTranslation } from "react-i18next";
import { reservationService } from "@/src/services/reservationService";
import { useBranch } from "@/src/contexts/BranchContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

interface UserMenuProps {
  onClose: () => void;
}

export function UserMenu({ onClose }: UserMenuProps) {
  const { signOut } = useClerk();
  const router = useRouter();
  const { userType, getToken } = useAuthRole();
  const { canAny, isLoading: isLoadingPermissions, isOrgAdmin } = usePermissions();
  const { branch, visibleBranches } = useBranch();
  const { t } = useTranslation();
  const [reservationsEnabled, setReservationsEnabled] = useState(true);

  const selectedBranch = branch?.id
    ? (visibleBranches as any[]).find((b: any) => b?.id === branch.id)
    : null;
  const organizationAppStatus = String(
    (selectedBranch as any)?.organization?.settings?.appStatus || "LIVE"
  ).toUpperCase();
  const isOrganizationUnavailable = Boolean(branch?.id) && organizationAppStatus !== "LIVE";

  const canShowAdminPanelLink =
    !isLoadingPermissions &&
    (isOrgAdmin ||
      (!!userType &&
        userType !== "USER" &&
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
        )));

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleProfilePress = () => {
    onClose();
    router.push("/profile");
  };

  const handleAdminPanelPress = () => {
    onClose();
    router.push("/(admin)");
  };

  const handleBookReservationPress = () => {
    onClose();
    router.push("/book-reservation");
  };

  const handleMyReservationsPress = () => {
    onClose();
    router.push("/my-reservations");
  };

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

    loadReservationSettings();
  }, [getToken, branch?.id]);

  return (
    <View style={styles.menu}>
      <TouchableOpacity style={styles.menuItem} onPress={handleProfilePress}>
        <Text style={styles.menuItemText}>{t("common.profile")}</Text>
      </TouchableOpacity>
      {reservationsEnabled ? (
        <TouchableOpacity
          style={[styles.menuItem, isOrganizationUnavailable && { opacity: 0.5 }]}
          onPress={handleBookReservationPress}
          disabled={isOrganizationUnavailable}
        >
          <Text style={styles.menuItemText}>{t("common.bookReservation")}</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.menuItem} onPress={handleMyReservationsPress}>
        <Text style={styles.menuItemText}>{t("common.myReservations")}</Text>
      </TouchableOpacity>
      {canShowAdminPanelLink && (
        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleAdminPanelPress}
        >
          <Text style={styles.menuItemText}>{t("common.adminPanel")}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.menuItem, styles.lastMenuItem]}
        onPress={handleSignOut}
      >
        <Text style={styles.menuItemText}>{t("common.logout")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    backgroundColor: "#171717",
    borderRadius: 12,
    minWidth: 160,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
  },
});
