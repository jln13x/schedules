import type { Agent } from "./cron/agent.ts";
import { claudeCode } from "./claude-code.ts";
import { codex } from "./codex.ts";
import { cursorAgent } from "./cursor-agent.ts";
import { opencode } from "./opencode.ts";
import { pi } from "./pi.ts";

/** The agent CLIs this tool schedules itself, with cron, by harness name. */
export const COMMAND_LINE_AGENTS = [
  "codex",
  "claude-code",
  "pi",
  "opencode",
  "cursor-agent",
] as const;
export type CommandLineAgent = (typeof COMMAND_LINE_AGENTS)[number];

export const AGENTS: Record<CommandLineAgent, Agent> = {
  codex,
  "claude-code": claudeCode,
  pi,
  opencode,
  "cursor-agent": cursorAgent,
};
