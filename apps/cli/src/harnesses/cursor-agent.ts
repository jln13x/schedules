import { type Agent, withModel } from "./cron/agent.ts";

export const cursorAgent: Agent = {
  label: "Cursor CLI",
  // The installer links both names; cursor-agent is the one other tools don't also use.
  binaries: ["cursor-agent", "agent"],
  setup: "https://cursor.com/docs/cli/overview",
  requiresModel: false,
  // --trust skips the workspace prompt nobody could answer. Ask mode is read-only; the sandbox
  // keeps edits inside the repository and turns the network off.
  invoke: (prompt, access, model) => ({
    args: [
      "-p",
      "--trust",
      "--output-format",
      "text",
      ...{
        read: ["--mode", "ask"],
        edit: ["--force", "--sandbox", "enabled"],
        full: ["--force", "--sandbox", "disabled"],
      }[access],
      ...withModel("--model", model),
    ],
    stdin: prompt,
  }),
};
