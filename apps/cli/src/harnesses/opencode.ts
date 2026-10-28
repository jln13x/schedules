import { type Access, type Agent, withModel } from "./cron/agent.ts";

// Read and edit deny by default, so a tool OpenCode adds later stays off until named here. Subagents
// don't inherit these rules, so launching one (task) would bypass them. OpenCode can't answer
// questions unattended, and a repo's opencode.json can't widen these.
const READ_ONLY = {
  read: "allow",
  glob: "allow",
  grep: "allow",
  list: "allow",
  lsp: "allow",
  skill: "allow",
  todoread: "allow",
  todowrite: "allow",
  webfetch: "allow",
  websearch: "allow",
};
const DENIED = {
  bash: "deny",
  task: "deny",
  external_directory: "deny",
  question: "deny",
};
const PERMISSIONS: Record<Access, Record<string, string>> = {
  read: { "*": "deny", ...READ_ONLY, ...DENIED, edit: "deny" },
  edit: { "*": "deny", ...READ_ONLY, ...DENIED, edit: "allow" },
  full: { "*": "allow", question: "deny" },
};

export const opencode: Agent = {
  label: "OpenCode",
  binaries: ["opencode"],
  setup: "https://opencode.ai/docs",
  // Without one, OpenCode silently uses its free hosted model.
  requiresModel: true,
  // Two OpenCode processes at once fail with "database is locked". Runs are queued, and a lock that
  // still happens, such as from a process that hasn't let go yet, is retried.
  oneAtATime: true,
  retryable: (output) => /database is locked/i.test(output),
  invoke: (prompt, access, model) => ({
    args: ["run", "--agent", "schedules", ...withModel("--model", model), "--format", "json"],
    stdin: prompt,
    env: {
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        agent: { schedules: { mode: "primary", permission: PERMISSIONS[access] } },
      }),
      // A repository's .opencode folder can carry plugins that run at startup, outside any
      // permission; its opencode.json still applies.
      ...(access === "full" ? {} : { OPENCODE_DISABLE_PROJECT_CONFIG: "1" }),
    },
  }),
  failed: (output) =>
    output.split("\n").some((line) => {
      try {
        return (JSON.parse(line) as { type?: unknown }).type === "error";
      } catch {
        return false;
      }
    }),
};
