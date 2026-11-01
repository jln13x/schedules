import type { ReactNode } from "react";
import { cn } from "cn";

const ALIGN = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
} as const;

/**
 * Shows `content` on hover or keyboard focus of the trigger. Pure CSS, so it works in server
 * components; the trigger is a button so keyboard users can reach it.
 */
export function Tooltip({
  content,
  label,
  children,
  className,
  align = "center",
}: {
  content: ReactNode;
  /** What a screen reader announces for the trigger, since the popover is hidden from it. */
  label: string;
  children: ReactNode;
  className?: string;
  /** Which edge of the trigger the popover lines up with; start or end keeps it on screen near a page edge. */
  align?: keyof typeof ALIGN;
}) {
  return (
    <span className="group/tooltip relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className={cn(
          "focus-visible:ring-ring cursor-help rounded-full focus-visible:ring-2 focus-visible:outline-none",
          className,
        )}
      >
        {children}
      </button>
      <span
        aria-hidden="true"
        className={cn(
          "border-border bg-popover text-foreground pointer-events-none absolute top-full z-20 mt-2 w-max max-w-64 rounded-md border px-2.5 py-1.5 text-left font-sans text-xs leading-5 font-normal tracking-normal normal-case opacity-0 shadow-sm transition-opacity group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100",
          ALIGN[align],
        )}
      >
        {content}
      </span>
    </span>
  );
}
