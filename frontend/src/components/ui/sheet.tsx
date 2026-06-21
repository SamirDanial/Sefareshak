import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import Icon from "@mdi/react";
import { mdiClose } from "@mdi/js";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom md:left-1/2 md:right-auto md:w-full md:max-w-screen-sm md:-translate-x-1/2",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
);

interface SheetContentProps
  extends Omit<
      React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
      "children"
    >,
    VariantProps<typeof sheetVariants> {
  children?: React.ReactNode;
  hideOverlay?: boolean;
  disableDragClose?: boolean;
}

// Draggable handle component for bottom sheets
const DraggableHandle = ({ onClose }: { onClose: () => void }) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState(0);
  const startY = React.useRef(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const CLOSE_THRESHOLD = 100; // pixels to drag before closing

  const handleDragStart = (clientY: number) => {
    setIsDragging(true);
    startY.current = clientY;
  };

  const handleDragMove = (clientY: number) => {
    if (!isDragging) return;
    const delta = clientY - startY.current;
    // Only allow dragging down (positive delta)
    if (delta > 0) {
      setDragOffset(delta);
    }
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    if (dragOffset > CLOSE_THRESHOLD) {
      onClose();
    }
    setDragOffset(0);
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientY);
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientY);
    };

    const handleMouseUp = () => {
      handleDragEnd();
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Apply transform to parent sheet content
  React.useEffect(() => {
    const sheetContent = containerRef.current?.closest('[data-sheet-content="bottom"]');
    if (sheetContent instanceof HTMLElement) {
      if (isDragging || dragOffset > 0) {
        sheetContent.style.transition = isDragging ? 'none' : 'transform 0.3s ease-out';
        sheetContent.style.transform = `translateY(${dragOffset}px)`;
      } else {
        sheetContent.style.transition = 'transform 0.3s ease-out';
        sheetContent.style.transform = '';
      }
    }
  }, [dragOffset, isDragging]);

  return (
    <div
      ref={containerRef}
      className="absolute top-0 left-0 right-0 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
    >
      <div className="w-10 h-1 bg-[#666] rounded-full" />
    </div>
  );
};

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, hideOverlay = false, disableDragClose = false, ...props }, ref) => {
  const closeRef = React.useRef<HTMLButtonElement>(null);

  const handleDragClose = () => {
    closeRef.current?.click();
  };

  return (
  <SheetPortal>
    {!hideOverlay && <SheetOverlay />}
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
        data-sheet-content={side}
      onOpenAutoFocus={(e) => e.preventDefault()}
      {...props}
    >
        {/* Draggable handle for bottom sheets */}
        {side === "bottom" && !disableDragClose && (
          <DraggableHandle onClose={handleDragClose} />
        )}
      {children}
        {/* Close button - different styling for bottom sheets */}
        {side === "bottom" ? (
          <SheetPrimitive.Close 
            ref={closeRef}
            className="absolute right-4 top-4 p-2 rounded-full bg-[#262626] hover:bg-[#333] transition-colors focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:ring-offset-[#151718]"
          >
            <Icon path={mdiClose} size={0.67} className="text-white" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        ) : (
      <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
        <Icon path={mdiClose} size={0.67} />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
        )}
    </SheetPrimitive.Content>
  </SheetPortal>
  );
});
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
