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

export function SkillCommands({
  skill,
  monthly,
}: {
  skill: { owner: string; repo: string; slug: string };
  monthly: boolean;
}) {
  const saved = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(STORAGE_KEY),
    () => null,
  );
  const { value: runner, command } = RUNNERS.find(({ value }) => value === saved) ?? RUNNERS[0];
  return (
    <section>
      <div className="border-border mb-4 flex items-center justify-between gap-4 border-b pb-3">
        <h2 className="font-mono text-xs tracking-wider">RUN IT ON A SCHEDULE</h2>
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
      <ol className="grid gap-4">
        <li className="grid gap-2">
          <p className="text-muted-foreground text-xs">
            1. Install it from skills.sh and schedule it in your repository
          </p>
          <CopyCommand
            key={`add-${runner}`}
            command={`${command} agent-schedules add ${skill.owner}/${skill.repo}/${skill.slug}`}
          />
        </li>
        <li className="grid gap-2">
          <p className="text-muted-foreground text-xs">
            2. Push it to the agent that runs it, such as <code>t3</code> or{" "}
            <code>claude-code</code> (
            <a href="/docs/harnesses" className="underline decoration-dotted underline-offset-4">
              all harnesses
            </a>
            )
          </p>
          <CopyCommand
            key={`push-${runner}`}
            command={`${command} agent-schedules push <harness>`}
          />
        </li>
      </ol>
      <p className="text-muted-foreground mt-3 text-xs">
        Runs use your agent and your accounts.
        {monthly && " T3 Code can't run monthly schedules; the other harnesses can."}
      </p>
    </section>
  );
}
