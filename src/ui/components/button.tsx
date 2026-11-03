// Adapted from shadcn/ui (MIT): native button only; Slot/asChild is not needed here.
import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  { variants: { variant: {
      default: "bg-primary text-primary-foreground hover:bg-primary/85",
      outline: "border border-border bg-background text-foreground hover:bg-muted",
      destructive: "bg-destructive text-white hover:bg-destructive/85",
    }, size: { default: "h-9 px-3 py-2", small: "h-8 px-3" } },
    defaultVariants: { variant: "default", size: "default" } },
);
export function Button({ className, variant, size, type = "button", ...props }:
  ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button type={type} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
