import type { ReactNode } from "react";
import { cn } from "cn";

/** An info mark that reveals a short explanation on hover or focus. Pure CSS, so it renders on the server. */
export function Hint({
  label,
  children,
  className,
}: {
  /** Read by screen readers in place of the hover text. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label}
        className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:ring-ring rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
      </button>
      <span
        aria-hidden="true"
        className="border-border bg-popover text-foreground pointer-events-none absolute top-full left-1/2 z-10 mt-2 w-max max-w-64 -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-left text-xs leading-5 font-normal opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
