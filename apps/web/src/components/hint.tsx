import type { ComponentProps, ReactNode } from "react";
import { Tooltip } from "@/components/tooltip";

/** An info mark that explains the thing next to it on hover or focus. */
export function Hint({
  label,
  children,
  align,
}: {
  label: string;
  children: ReactNode;
  align?: ComponentProps<typeof Tooltip>["align"];
}) {
  return (
    <Tooltip
      label={label}
      content={children}
      {...(align && { align })}
      className="text-muted-foreground hover:text-foreground focus-visible:text-foreground transition-colors"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    </Tooltip>
  );
}
