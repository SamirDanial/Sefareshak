import * as React from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import Icon from "@mdi/react";
import { mdiChevronDown } from "@mdi/js";

import { cn } from "@/lib/utils";

interface CollapsibleCardProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleCard({
  icon,
  title,
  description,
  defaultOpen = false,
  children,
  className,
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <Collapsible.Root
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("rounded-xl border bg-card text-card-foreground shadow", className)}
    >
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between p-6 text-left hover:bg-muted/50 transition-colors rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="flex flex-col space-y-1.5">
            <div className="flex items-center gap-2 font-semibold leading-none tracking-tight">
              {icon}
              {title}
            </div>
            {description && (
              <p className="text-sm text-muted-foreground font-normal">{description}</p>
            )}
          </div>
          <Icon
            path={mdiChevronDown}
            size={0.83}
            className={cn(
              "text-muted-foreground shrink-0 transition-transform duration-300 ease-in-out",
              isOpen && "rotate-180"
            )}
          />
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content
        className={cn(
          "overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
        )}
      >
        <div className="p-6 pt-0">{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
