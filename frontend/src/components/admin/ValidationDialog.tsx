import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Organization } from "@/services/branchService";
import { useAuth } from "@/contexts/AuthContext";
import branchService from "@/services/branchService";
import Icon from "@mdi/react";
import { mdiCalendar, mdiCurrencyUsd, mdiCreditCard, mdiNoteText } from "@mdi/js";

interface ValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: Organization | null;
  onSuccess?: () => void;
  mode?: "create" | "edit";
  existingValidation?: any; // Existing validation data for edit mode
}

const ValidationDialog: React.FC<ValidationDialogProps> = ({
  open,
  onOpenChange,
  organization,
  onSuccess,
  mode = "create",
  existingValidation,
}) => {
  const { t } = useTranslation();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "online"
  >("cash");
  const [paymentStatus, setPaymentStatus] = useState<
    "pending" | "paid" | "failed"
  >("pending");
  const [notes, setNotes] = useState("");

  // Populate form with existing validation data when in edit mode
  useEffect(() => {
    if (mode === "edit" && existingValidation && open) {
      setExpiresAt(existingValidation.expiresAt ? new Date(existingValidation.expiresAt).toISOString().split('T')[0] : "");
      setAmount(existingValidation.amount?.toString() || "");
      setCurrency(existingValidation.currency || "USD");
      setPaymentMethod(existingValidation.paymentMethod || "cash");
      setPaymentStatus(existingValidation.paymentStatus || "pending");
      setNotes(existingValidation.notes || "");
    } else if (mode === "create" && open) {
      resetForm();
    }
  }, [mode, existingValidation, open]);

  const resetForm = () => {
    setExpiresAt("");
    // For free organizations, reset payment fields to undefined
    // For paid organizations, set default values
    if (organization?.freeVersion) {
      setAmount("");
      setCurrency("USD");
      setPaymentMethod("cash");
      setPaymentStatus("pending");
    } else {
      setAmount("");
      setCurrency("USD");
      setPaymentMethod("cash");
      setPaymentStatus("pending");
    }
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!organization || !expiresAt) {
      toast.error(
        t("admin.organizations.validation.validationDialog.validationRequired")
      );
      return;
    }

    const token = await getToken();
    if (!token) return;

    setLoading(true);
    try {
      const data: any = {
        expiresAt,
        notes: notes.trim() || undefined,
      };

      // Add payment info only if amount is provided
      if (amount && parseFloat(amount) > 0) {
        data.amount = parseFloat(amount);
        data.currency = currency;
        data.paymentMethod = paymentMethod;
        data.paymentStatus = paymentStatus;
      }

      if (mode === "edit") {
        await branchService.updateValidation(organization.id, existingValidation.id, data, token);
        toast.success(t("admin.organizations.validation.validationDialog.validationUpdated"));
      } else {
        await branchService.createValidation(organization.id, data, token);
        toast.success(t("admin.organizations.validation.validationDialog.validationCreated"));
      }
      
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(
        error?.message ||
          t("admin.organizations.validation.validationDialog.validationFailed")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-card text-foreground border-border">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl font-semibold text-white flex items-center gap-2">
            <Icon path={mdiCalendar} size={0.8} />
            {mode === "edit" 
              ? t("admin.organizations.validation.validationDialog.editTitle")
              : t("admin.organizations.validation.validationDialog.createTitle")
            }
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {organization?.name}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Icon path={mdiCalendar} size={0.6} />
              {t("admin.organizations.validation.validationDialog.expiresAt")}{" "}
              <span className="text-red-500">*</span>
            </Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={today}
              required
              className="bg-transparent text-foreground border-border"
            />
          </div>

          {/* Payment fields - only show for paid organizations */}
          {!organization?.freeVersion && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Icon path={mdiCurrencyUsd} size={0.6} />
                  {t("admin.organizations.validation.validationDialog.paymentAmount")}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t("admin.organizations.validation.validationDialog.paymentAmountPlaceholder")}
                  className="bg-transparent text-foreground border-border"
                />
                <p className="text-xs text-muted-foreground">
                  {t("admin.organizations.validation.validationDialog.notesPlaceholder")}
                </p>
              </div>

              {amount && parseFloat(amount) > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t("admin.organizations.validation.currency")}
                  </Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="bg-transparent text-foreground border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">
                        {t("admin.organizations.validation.usd")}
                      </SelectItem>
                      <SelectItem value="EUR">
                        {t("admin.organizations.validation.eur")}
                      </SelectItem>
                      <SelectItem value="GBP">
                        {t("admin.organizations.validation.gbp")}
                      </SelectItem>
                      <SelectItem value="AFN">AFN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Icon path={mdiCreditCard} size={0.6} />
                  {t("admin.organizations.validation.validationDialog.paymentMethod")}
                </Label>
                <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as "cash" | "online")}>
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">
                      {t("admin.organizations.validation.validationDialog.cash")}
                    </SelectItem>
                    <SelectItem value="online">
                      {t("admin.organizations.validation.validationDialog.online")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t("admin.organizations.validation.validationDialog.paymentStatus")}
                </Label>
                <Select value={paymentStatus} onValueChange={(value) => setPaymentStatus(value as "pending" | "paid" | "failed")}>
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">
                      {t("admin.organizations.validation.validationDialog.pending")}
                    </SelectItem>
                    <SelectItem value="paid">
                      {t("admin.organizations.validation.validationDialog.paid")}
                    </SelectItem>
                    <SelectItem value="failed">
                      {t("admin.organizations.validation.validationDialog.failed")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Icon path={mdiNoteText} size={0.6} />
              {t("admin.organizations.validation.validationDialog.notes")}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("admin.organizations.validation.validationDialog.notesPlaceholder")}
              rows={3}
              className="bg-transparent text-foreground border-border resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="bg-transparent hover:bg-muted text-foreground border border-border"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              type="submit"
              disabled={loading || !expiresAt}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              {loading ? (
                <>
                  <Icon path={mdiCalendar} size={0.6} className="mr-2 animate-spin" />
                  {t("common.validating", { defaultValue: "Validating..." })}
                </>
              ) : (
                <>
                  <Icon path={mdiCalendar} size={0.6} className="mr-2" />
                  {t("admin.organizations.validation.validationDialog.validate")}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ValidationDialog;
