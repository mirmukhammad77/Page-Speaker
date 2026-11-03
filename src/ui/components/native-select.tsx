// Adapted from shadcn/ui (MIT), keeping the native select and its keyboard behavior.
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select data-slot="native-select" className={cn(
    "h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    className,
  )} {...props} />;
}
