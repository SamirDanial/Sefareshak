import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import { mdiPause, mdiInformation, mdiCashClock } from "@mdi/js";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/Toast";
import { useAuth } from "@/contexts/AuthContext";
import branchService from "@/services/branchService";

interface UnvalidateValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: any;
  validationId: string | null;
  onSuccess?: () => void;
}

const UnvalidateValidationDialog: React.FC<UnvalidateValidationDialogProps> = ({
  open,
  onOpenChange,
  organization,
  validationId,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleUnvalidate = async () => {
    if (!organization?.id || !validationId) return;

    const token = await getToken();
    if (!token) return;

    setLoading(true);
    try {
      await branchService.unvalidateValidation(organization.id, validationId, token);

      toast.success(
        t("admin.organizations.validation.unvalidateDialog.unvalidated", {
          defaultValue: "Validation temporarily unvalidated",
        })
      );

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(
        error?.message ||
          t("admin.organizations.validation.unvalidateDialog.unvalidateFailed", {
            defaultValue: "Failed to temporarily unvalidate",
          })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card text-foreground border-border">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl font-semibold text-orange-600 flex items-center gap-2">
            <Icon path={mdiPause} size={0.8} />
            {t("admin.organizations.validation.unvalidateDialog.title", {
              defaultValue: "Temporarily Unvalidate",
            })}
          </DialogTitle>
          <p className="text-sm text-muted-foreground font-medium">{organization?.name}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Icon path={mdiInformation} size={1} className="text-orange-600 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                  {t("admin.organizations.validation.unvalidateDialog.temporaryAction", {
                    defaultValue: "This is a temporary action",
                  })}
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-300">
                  {t("admin.organizations.validation.unvalidateDialog.unvalidateExplanation", {
                    defaultValue: "This will temporarily deactivate validation without changing expiration dates.",
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Icon path={mdiCashClock} size={0.6} />
              {t("admin.organizations.validation.unvalidateDialog.reasonForUnvalidation", {
                defaultValue: "Reason",
              })}
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>{t("admin.organizations.validation.unvalidateDialog.reason1", { defaultValue: "Payment pending" })}</li>
              <li>{t("admin.organizations.validation.unvalidateDialog.reason2", { defaultValue: "Chargeback/dispute" })}</li>
              <li>{t("admin.organizations.validation.unvalidateDialog.reason3", { defaultValue: "Manual review" })}</li>
            </ul>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={handleUnvalidate}
              disabled={loading}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  {t("admin.organizations.validation.unvalidateDialog.unvalidating", {
                    defaultValue: "Unvalidating...",
                  })}
                </>
              ) : (
                <>
                  <Icon path={mdiPause} size={0.6} className="mr-2" />
                  {t("admin.organizations.validation.unvalidateDialog.confirmUnvalidate", {
                    defaultValue: "Confirm",
                  })}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UnvalidateValidationDialog;
