import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import { mdiCalendar, mdiCurrencyUsd, mdiCreditCard } from "@mdi/js";

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
import { toast } from "@/components/Toast";

interface ValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: Organization | null;
  onSuccess?: () => void;
  mode?: "create" | "edit";
  existingValidation?: any;
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
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | "failed">("pending");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (mode === "edit" && existingValidation && open) {
      setExpiresAt(
        existingValidation.expiresAt
          ? new Date(existingValidation.expiresAt).toISOString().split("T")[0]
          : ""
      );
      setAmount(existingValidation.amount?.toString() || "");
      setCurrency(existingValidation.currency || "USD");
      setPaymentMethod((existingValidation.paymentMethod || "cash").toLowerCase() as "cash" | "online");
      setPaymentStatus((existingValidation.paymentStatus || "pending").toLowerCase() as "pending" | "paid" | "failed");
      setNotes(existingValidation.notes || "");
      return;
    }

    if (mode === "create" && open) {
      setExpiresAt("");
      setAmount("");
      setCurrency("USD");
      setPaymentMethod("cash");
      setPaymentStatus("pending");
      setNotes("");
    }
  }, [mode, existingValidation, open]);

  const today = new Date().toISOString().split("T")[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!organization || !expiresAt) {
      toast.error(
        t("admin.organizations.validation.validationDialog.validationRequired", {
          defaultValue: "Expiration date is required",
        })
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

      if (amount && parseFloat(amount) > 0) {
        data.amount = parseFloat(amount);
        data.currency = currency;
        data.paymentMethod = paymentMethod;
        data.paymentStatus = paymentStatus;
      }

      if (mode === "edit") {
        await branchService.updateValidation(organization.id, existingValidation.id, data, token);
        toast.success(
          t("admin.organizations.validation.validationDialog.validationUpdated", {
            defaultValue: "Validation updated",
          })
        );
      } else {
        await branchService.createValidation(organization.id, data, token);
        toast.success(
          t("admin.organizations.validation.validationDialog.validationCreated", {
            defaultValue: "Validation created",
          })
        );
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(
        error?.message ||
          t("admin.organizations.validation.validationDialog.validationFailed", {
            defaultValue: "Failed to save validation",
          })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-card text-foreground border-border">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Icon path={mdiCalendar} size={0.8} />
            {mode === "edit"
              ? t("admin.organizations.validation.validationDialog.editTitle", { defaultValue: "Edit Validation" })
              : t("admin.organizations.validation.validationDialog.createTitle", { defaultValue: "Validate Organization" })}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{organization?.name}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Icon path={mdiCalendar} size={0.6} />
              {t("admin.organizations.validation.validationDialog.expiresAt", { defaultValue: "Expires at" })}{" "}
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

          {!organization?.freeVersion ? (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Icon path={mdiCurrencyUsd} size={0.6} />
                  {t("admin.organizations.validation.validationDialog.paymentAmount", { defaultValue: "Payment amount" })}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t(
                    "admin.organizations.validation.validationDialog.paymentAmountPlaceholder",
                    { defaultValue: "Enter amount" }
                  )}
                  className="bg-transparent text-foreground border-border"
                />
              </div>

              {amount && parseFloat(amount) > 0 ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      {t("admin.organizations.validation.currency", { defaultValue: "Currency" })}
                    </Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger className="bg-transparent text-foreground border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">{t("admin.organizations.validation.usd", { defaultValue: "USD" })}</SelectItem>
                        <SelectItem value="EUR">{t("admin.organizations.validation.eur", { defaultValue: "EUR" })}</SelectItem>
                        <SelectItem value="GBP">{t("admin.organizations.validation.gbp", { defaultValue: "GBP" })}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Icon path={mdiCreditCard} size={0.6} />
                      {t("admin.organizations.validation.validationDialog.paymentMethod", { defaultValue: "Payment method" })}
                    </Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={(value) => setPaymentMethod(value as "cash" | "online")}
                    >
                      <SelectTrigger className="bg-transparent text-foreground border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">{t("admin.organizations.validation.validationDialog.cash", { defaultValue: "Cash" })}</SelectItem>
                        <SelectItem value="online">{t("admin.organizations.validation.validationDialog.online", { defaultValue: "Online" })}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      {t("admin.organizations.validation.validationDialog.paymentStatus", { defaultValue: "Payment status" })}
                    </Label>
                    <Select
                      value={paymentStatus}
                      onValueChange={(value) => setPaymentStatus(value as "pending" | "paid" | "failed")}
                    >
                      <SelectTrigger className="bg-transparent text-foreground border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">{t("admin.organizations.validation.validationDialog.pending", { defaultValue: "Pending" })}</SelectItem>
                        <SelectItem value="paid">{t("admin.organizations.validation.validationDialog.paid", { defaultValue: "Paid" })}</SelectItem>
                        <SelectItem value="failed">{t("admin.organizations.validation.validationDialog.failed", { defaultValue: "Failed" })}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t("admin.organizations.validation.validationDialog.notes", { defaultValue: "Notes" })}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("admin.organizations.validation.validationDialog.notesPlaceholder", { defaultValue: "Optional notes" })}
              className="bg-transparent text-foreground border-border"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-pink-500 hover:bg-pink-600 text-white">
              {loading
                ? t("common.saving", { defaultValue: "Saving..." })
                : mode === "edit"
                  ? t("common.update", { defaultValue: "Update" })
                  : t("common.confirm", { defaultValue: "Confirm" })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ValidationDialog;
