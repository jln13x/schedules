import type { HarnessDefinition } from "../harness.ts";
import { claudeDesktop } from "./claude-desktop.ts";
import { codexDesktop } from "./codex-desktop.ts";
import { COMMAND_LINE_AGENTS, type CommandLineAgent } from "./agents.ts";
import { cronHarness } from "./cron/index.ts";
import { t3 } from "./t3.ts";

export { COMMAND_LINE_AGENTS } from "./agents.ts";
export { ACCESS, type Access, listJobs, removeJob, runJob } from "./cron/index.ts";

/** Apps that schedule tasks themselves, then the agent CLIs this tool schedules with cron. */
export const HARNESSES = ["t3", "codex-desktop", "claude-desktop", ...COMMAND_LINE_AGENTS] as const;
export type HarnessName = (typeof HARNESSES)[number];

export const isCommandLine = (harness: HarnessName): harness is CommandLineAgent =>
  (COMMAND_LINE_AGENTS as ReadonlyArray<string>).includes(harness);

export const DEFINITIONS: Record<HarnessName, HarnessDefinition> = {
  t3,
  "codex-desktop": codexDesktop,
  "claude-desktop": claudeDesktop,
  ...(Object.fromEntries(COMMAND_LINE_AGENTS.map((agent) => [agent, cronHarness(agent)])) as Record<
    CommandLineAgent,
    HarnessDefinition
  >),
};
