import type { ComponentProps } from "react";
import { cn } from "cn";

export function Panel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-border bg-card text-card-foreground relative flex flex-col rounded-md border",
        className,
      )}
      {...props}
    />
  );
}
