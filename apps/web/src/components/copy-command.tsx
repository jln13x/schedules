"use client";

import { cn } from "cn";
import { useState } from "react";

export function CopyCommand({ command, wrap = false }: { command: string; wrap?: boolean }) {
  const [status, setStatus] = useState("Copy command");
  return (
    <div className="bg-secondary flex min-w-0 items-center gap-3 rounded-md px-4 py-3">
      <code
        className={cn(
          "text-foreground/80 min-w-0 flex-1 font-mono text-xs sm:text-sm",
          wrap ? "break-all" : "overflow-x-auto whitespace-nowrap",
        )}
      >
        <span aria-hidden="true" className="text-muted-foreground select-none">
          ${" "}
        </span>
        {command}
      </code>
      <button
        type="button"
        aria-label={status}
        className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring h-8 shrink-0 rounded-md px-3 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setStatus("Copied");
          } catch {
            setStatus("Select and copy the command");
          }
        }}
      >
        {status === "Copy command" ? "Copy" : status}
      </button>
      <span role="status" className="sr-only">
        {status === "Copy command" ? "" : status}
      </span>
    </div>
  );
}
