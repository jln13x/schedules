import { type Agent, withModel } from "./cron/agent.ts";

export const claudeCode: Agent = {
  label: "Claude Code",
  binaries: ["claude"],
  setup: "https://code.claude.com/docs/en/setup",
  requiresModel: false,
  invoke: (prompt, access, model) => ({
    args: [
      "-p",
      "--permission-mode",
      { read: "dontAsk", edit: "acceptEdits", full: "bypassPermissions" }[access],
      // A repository's own settings can start hooks and MCP servers, which the permission mode
      // doesn't restrict, so below full only the user's settings count.
      ...(access === "full" ? [] : ["--setting-sources", "user", "--strict-mcp-config"]),
      ...withModel("--model", model),
    ],
    stdin: prompt,
  }),
  // dontAsk and acceptEdits deny, rather than wait for, anything the user's settings don't allow.
  limits: {
    read: "commands need allow rules in your user-level Claude Code settings",
    edit: "commands need allow rules in your user-level Claude Code settings",
  },
};
