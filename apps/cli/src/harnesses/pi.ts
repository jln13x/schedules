import { type Agent, withModel } from "./cron/agent.ts";

export const pi: Agent = {
  label: "Pi",
  binaries: ["pi"],
  setup: "https://github.com/earendil-works/pi#readme",
  requiresModel: false,
  // The prompt goes on stdin, where other users of the machine can't list it as an argument.
  invoke: (prompt, access, model) => ({
    args: [
      "-p",
      ...{ read: ["--tools", "read"], edit: ["--tools", "read,edit,write"], full: [] }[access],
      ...withModel("--model", model),
    ],
    stdin: prompt,
  }),
};
