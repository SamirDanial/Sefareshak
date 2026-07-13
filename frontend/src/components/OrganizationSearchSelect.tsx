import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import Icon from "@mdi/react";
import { mdiCheck, mdiChevronDown } from "@mdi/js";
import type { Organization } from "@/services/branchService";
import { useTranslation } from "react-i18next";
import { getLocalizedName } from "@/utils/localization";

type Props = {
  organizations: Organization[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

const OrganizationSearchSelect: React.FC<Props> = ({
  organizations,
  value,
  onValueChange,
  placeholder = "Select organization",
  disabled,
}) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => organizations.find((o) => o.id === value) || null,
    [organizations, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter((o) => (o.name || "").toLowerCase().includes(q));
  }, [organizations, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          disabled={disabled}
          className={cn(
            "w-full justify-between bg-transparent text-foreground border border-border h-10 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/40 focus-visible:ring-offset-0",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {getLocalizedName(selected?.name, selected?.nameFa, i18n.language) || placeholder}
          </span>
          <Icon path={mdiChevronDown} size={0.67} className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("common.search", { defaultValue: "Search..." })}
          className="bg-transparent text-foreground border-border"
          autoFocus
        />
        <div className="mt-2 max-h-60 overflow-y-auto rounded-md border border-border bg-card">
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No results</div>
          ) : (
            filtered.map((org) => {
              const isSelected = org.id === value;
              return (
                <button
                  type="button"
                  key={org.id}
                  onClick={() => {
                    onValueChange(org.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:bg-muted/70",
                    isSelected && "bg-muted/70"
                  )}
                >
                  <span className="w-4 h-4 flex items-center justify-center">
                    {isSelected && <Icon path={mdiCheck} size={0.67} />}
                  </span>
                  <span className="truncate">{getLocalizedName(org.name, org.nameFa, i18n.language)}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default OrganizationSearchSelect;
