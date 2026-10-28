import { cn } from "cn";
import type { ReactNode } from "react";

/** Long-form text: legal pages, documentation, and schedule prompts rendered from Markdown. */
export function Prose({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "prose prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mb-3 prose-h2:mt-10 prose-h2:text-xl prose-p:text-muted-foreground prose-a:text-foreground prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:bg-secondary prose-pre:px-4 prose-pre:py-4 prose-pre:leading-6 prose-th:text-xs prose-th:font-medium prose-td:align-top prose-td:text-xs prose-td:text-muted-foreground prose-th:border-border prose-td:border-border max-w-none text-sm leading-7 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
