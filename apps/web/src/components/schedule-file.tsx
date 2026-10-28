"use client";

import { useState, type ReactNode } from "react";
import { Panel } from "@/components/panel";

const VIEWS = [
  { value: "prompt", label: "PROMPT" },
  { value: "file", label: "FILE" },
] as const;

export function ScheduleFile({ source, children }: { source: string; children: ReactNode }) {
  const [view, setView] = useState<(typeof VIEWS)[number]["value"]>("prompt");
  const [status, setStatus] = useState("Copy file");
  return (
    <section>
      <div
        role="tablist"
        aria-label="Schedule view"
        className="border-border mb-6 flex gap-5 border-b pb-3 font-mono text-xs"
      >
        {VIEWS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => setView(value)}
            className="text-muted-foreground aria-selected:text-foreground hover:text-foreground py-1 tracking-wider transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      {view === "prompt" ? (
        children
      ) : (
        <Panel>
          <button
            type="button"
            aria-label={status}
            className="text-foreground/80 hover:text-foreground bg-card hover:bg-accent focus-visible:ring-ring border-border absolute top-3 right-3 h-8 rounded-md border px-3 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(source);
                setStatus("Copied");
              } catch {
                setStatus("Select and copy the file");
              }
            }}
          >
            {status === "Copy file" ? "Copy" : status}
          </button>
          <pre className="text-foreground/90 p-6 pr-20 font-mono text-xs leading-6 break-words whitespace-pre-wrap">
            {source}
          </pre>
          <span role="status" className="sr-only">
            {status === "Copy file" ? "" : status}
          </span>
        </Panel>
      )}
    </section>
  );
}
