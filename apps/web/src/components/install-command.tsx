"use client";

import { useSyncExternalStore } from "react";
import { CopyCommand } from "@/components/copy-command";

const RUNNERS = [
  { value: "npm", command: "npx" },
  { value: "bun", command: "bunx" },
  { value: "pnpm", command: "pnpm dlx" },
  { value: "yarn", command: "yarn dlx" },
] as const;
const STORAGE_KEY = "package-runner";
// `storage` only fires in other tabs, so this tab announces its own changes.
const CHANGE_EVENT = "package-runner-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function InstallCommand({ source }: { source: string }) {
  const saved = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(STORAGE_KEY),
    () => null,
  );
  const { value: runner, command } = RUNNERS.find(({ value }) => value === saved) ?? RUNNERS[0];
  return (
    <section>
      <div className="border-border mb-4 flex items-center justify-between gap-4 border-b pb-3">
        <h2 className="font-mono text-xs tracking-wider">INSTALLATION</h2>
        <div role="tablist" aria-label="Package manager" className="flex gap-4 font-mono text-xs">
          {RUNNERS.map(({ value }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={runner === value}
              onClick={() => {
                localStorage.setItem(STORAGE_KEY, value);
                window.dispatchEvent(new Event(CHANGE_EVENT));
              }}
              className="text-muted-foreground aria-selected:text-foreground hover:text-foreground py-1 transition-colors"
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <CopyCommand key={runner} command={`${command} agent-schedules add ${source}`} />
      <p className="text-muted-foreground mt-3 text-xs">
        Review the prompt before pushing. Schedules run using your agent and accounts.
      </p>
    </section>
  );
}
