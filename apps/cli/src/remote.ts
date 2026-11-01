import { spawn } from "node:child_process";
import { version } from "../package.json";

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * Starts this CLI's version on the remote: one installed there, then the copy its cron jobs run,
 * then npx. Only the same version is reused, since callers read its JSON. The state folder is
 * worked out the way the CLI does, because a non-interactive shell has none of the CLI's defaults.
 */
const LAUNCHER = `cli="$1"; want="$2"; shift 2
if [ -n "$cli" ]; then exec $cli "$@"; fi
if [ -n "$AGENT_SCHEDULES_HOME" ]; then state="$AGENT_SCHEDULES_HOME"
elif [ "$(uname)" = Darwin ]; then state="$HOME/Library/Application Support/agent-schedules"
else state="\${XDG_STATE_HOME:-$HOME/.local/state}/agent-schedules"; fi
if command -v agent-schedules >/dev/null 2>&1 && [ "$(agent-schedules --version 2>/dev/null)" = "$want" ]; then exec agent-schedules "$@"; fi
if [ -f "$state/agent-schedules.mjs" ] && [ "$(node "$state/agent-schedules.mjs" --version 2>/dev/null)" = "$want" ]; then exec node "$state/agent-schedules.mjs" "$@"; fi
exec npx -y "agent-schedules@$want" "$@"`;

/** The command line the remote shell runs; every argument is quoted, so none is reinterpreted. */
const remoteCommand = (args: ReadonlyArray<string>) =>
  [
    "sh",
    "-lc",
    shellQuote(LAUNCHER),
    "agent-schedules",
    // A command to run in place of the lookup, for tests and for a checkout of this CLI.
    shellQuote(process.env.AGENT_SCHEDULES_REMOTE_CLI ?? ""),
    shellQuote(version),
    ...args.map(shellQuote),
  ].join(" ");

export function checkHost(host: string): string {
  // A host that starts with a dash would be read as an ssh option.
  if (!/^[\w.@:[\]-]+$/.test(host) || host.startsWith("-")) {
    throw new Error(`${host} is not an ssh host`);
  }

  return host;
}

export interface RemoteResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs this CLI on a host over ssh. Captured runs are for reading JSON; the others take over the
 * terminal, so prompts and output work as they do locally. ssh never asks for a password here,
 * since nobody may be there to type it.
 */
export function runRemote(
  host: string,
  args: ReadonlyArray<string>,
  { capture = false }: { readonly capture?: boolean } = {},
): Promise<RemoteResult> {
  const terminal = !capture && process.stdin.isTTY === true && process.stdout.isTTY === true;
  const child = spawn(
    process.env.AGENT_SCHEDULES_SSH ?? "ssh",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      terminal ? "-t" : "-T",
      "--",
      checkHost(host),
      remoteCommand(args),
    ],
    { stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" },
  );
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.on("error", (error) =>
      reject(new Error(`ssh ${host}: ${error.message}`, { cause: error })),
    );
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
