/**
 * Checks that every flag a scheduled run passes to each command-line agent still exists in the
 * agent's `--help`. Flags come from the real invocations in each agent's file, so there is nothing to
 * keep in sync by hand; whether their values are still accepted is what the marker runs show.
 * Costs nothing: no model is called. Exit 1 when an installed agent is missing a flag.
 */
import { AGENTS, COMMAND_LINE_AGENTS } from "../src/harnesses/agents.ts";
import { ACCESS } from "../src/harnesses/cron/agent.ts";
import { versionNumber } from "../src/harnesses/verified.ts";

const HELP_TIMEOUT_MS = 20_000;
const only = process.argv.slice(2);
const agents = COMMAND_LINE_AGENTS.filter((agent) => only.length === 0 || only.includes(agent));

async function capture(command: ReadonlyArray<string>) {
  const child = Bun.spawn([...command], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const killers = [
    setTimeout(() => child.kill("SIGTERM"), HELP_TIMEOUT_MS),
    setTimeout(() => child.kill("SIGKILL"), HELP_TIMEOUT_MS + 5_000),
  ];
  try {
    const [stdout, stderr] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    await child.exited;
    return `${stdout}\n${stderr}`;
  } finally {
    for (const killer of killers) {
      clearTimeout(killer);
    }
  }
}

/** The subcommand, flags and enum values an agent is started with, over every access level. */
function usage(agent: (typeof COMMAND_LINE_AGENTS)[number]) {
  const flags = new Set<string>();
  const values = new Map<string, Set<string>>();
  let subcommand: string | undefined;
  for (const access of ACCESS) {
    const { args } = AGENTS[agent].invoke("probe", access, "probe-model");
    const [first] = args;

    if (first && !first.startsWith("-")) {
      subcommand = first;
    }

    args.forEach((arg, index) => {
      if (!arg.startsWith("-") || arg === "--") {
        return;
      }

      flags.add(arg);
      const next = args[index + 1];

      if (next && !next.startsWith("-") && next !== "probe" && next !== "probe-model") {
        values.set(arg, (values.get(arg) ?? new Set()).add(next));
      }
    });
  }
  return { subcommand, flags, values };
}

const flagShown = (help: string, flag: string) =>
  flag.startsWith("--")
    ? new RegExp(`(^|[\\s,])${flag}(?=[\\s,=<\\[]|$)`, "m").test(help)
    : new RegExp(`(^|[\\s,])${flag}(?=[\\s,])`, "m").test(help);

let failed = false;
for (const agent of agents) {
  const spec = AGENTS[agent];
  const binary = spec.binaries.map((name) => Bun.which(name)).find(Boolean);

  if (!binary) {
    console.log(`${agent.padEnd(13)} skip      not installed`);
    continue;
  }

  const version = versionNumber(await capture([binary, "--version"])) ?? "unknown version";
  const { subcommand, flags, values } = usage(agent);
  const help = await capture([binary, ...(subcommand ? [subcommand] : []), "--help"]);
  const missing = [...flags].filter((flag) => !flagShown(help, flag));
  const unlisted = [...values]
    .flatMap(([flag, set]) => [...set].map((value) => `${flag} ${value}`))
    .filter((pair) => !help.includes(pair.split(" ")[1] ?? ""));
  const command = [spec.binaries[0], subcommand].filter(Boolean).join(" ");

  if (missing.length > 0) {
    failed = true;
    console.log(
      `${agent.padEnd(13)} FAIL      ${version}: ${command} --help lacks ${missing.join(", ")}`,
    );
    continue;
  }

  const note = unlisted.length > 0 ? `; values not shown in help: ${unlisted.join(", ")}` : "";
  console.log(`${agent.padEnd(13)} ok        ${version}: ${[...flags].join(" ")}${note}`);
}
process.exit(failed ? 1 : 0);
