import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import Icon from "@mdi/react";
import { mdiPause, mdiInformation, mdiCashClock } from "@mdi/js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import branchService from "@/services/branchService";

interface UnvalidateValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: any;
  validationId: string;
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
    const token = await getToken();
    if (!token) return;

    setLoading(true);
    try {
      await branchService.unvalidateValidation(organization.id, validationId, token);
      
      toast.success(
        t("admin.organizations.validation.unvalidateDialog.unvalidated")
      );
      
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error unvalidating validation:", error);
      toast.error(
        error?.message ||
          t("admin.organizations.validation.unvalidateDialog.unvalidateFailed")
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
            {t("admin.organizations.validation.unvalidateDialog.title")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground font-medium">
            {organization?.name}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Information Message */}
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Icon path={mdiInformation} size={1} className="text-orange-600 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                  {t("admin.organizations.validation.unvalidateDialog.temporaryAction")}
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-300">
                  {t("admin.organizations.validation.unvalidateDialog.unvalidateExplanation")}
                </p>
              </div>
            </div>
          </div>

          {/* Reason for Unvalidation */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Icon path={mdiCashClock} size={0.6} />
              {t("admin.organizations.validation.unvalidateDialog.reasonForUnvalidation")}
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>
                {t("admin.organizations.validation.unvalidateDialog.reason1")}
              </li>
              <li>
                {t("admin.organizations.validation.unvalidateDialog.reason2")}
              </li>
              <li>
                {t("admin.organizations.validation.unvalidateDialog.reason3")}
              </li>
            </ul>
          </div>

          {/* What happens next */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">
              {t("admin.organizations.validation.unvalidateDialog.whatHappensNext")}
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>
                {t("admin.organizations.validation.unvalidateDialog.next1")}
              </li>
              <li>
                {t("admin.organizations.validation.unvalidateDialog.next2")}
              </li>
              <li>
                {t("admin.organizations.validation.unvalidateDialog.next3")}
              </li>
              <li>
                {t("admin.organizations.validation.unvalidateDialog.next4")}
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
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
                  {t("admin.organizations.validation.unvalidateDialog.unvalidating")}
                </>
              ) : (
                <>
                  <Icon path={mdiPause} size={0.6} className="mr-2" />
                  {t("admin.organizations.validation.unvalidateDialog.confirmUnvalidate")}
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
