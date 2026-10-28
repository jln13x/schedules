import { type Agent, withModel } from "./cron/agent.ts";

export const codex: Agent = {
  label: "Codex CLI",
  binaries: ["codex"],
  setup: "https://developers.openai.com/codex/cli",
  requiresModel: false,
  invoke: (prompt, access, model) => ({
    args: [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      { read: "read-only", edit: "workspace-write", full: "danger-full-access" }[access],
      // Below full, an approved escalation (auto_review approves them unattended) or a saved
      // allow rule would run a command outside the sandbox, and a repository trusted in the
      // user's config gets its own .codex/config.toml loaded, MCP servers included; without the
      // user's config the repository is untrusted and that file stays unread.
      ...(access === "full"
        ? []
        : ["-c", 'approval_policy="never"', "--ignore-rules", "--ignore-user-config"]),
      ...withModel("--model", model),
    ],
    stdin: prompt,
  }),
};
