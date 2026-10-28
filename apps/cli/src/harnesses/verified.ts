import type { CommandLineAgent } from "./agents.ts";

interface Verified {
  readonly version: string;
  /** The day the marker run or desktop verification passed, as YYYY-MM-DD. */
  readonly date: string;
}

/**
 * The newest release of each command-line agent that a verification run has passed against.
 * `doctor` compares the installed version with it; the sandbox and `/verify-harness` update it.
 * Null means no run has passed yet.
 */
export const VERIFIED: Record<CommandLineAgent, Verified | null> = {
  codex: { version: "0.165.0", date: "2026-10-28" },
  "claude-code": { version: "2.1.312", date: "2026-10-28" },
  "cursor-agent": { version: "2026.10.22", date: "2026-10-28" },
  pi: { version: "1.4.0", date: "2026-10-28" },
  opencode: { version: "1.19.5", date: "2026-10-28" },
};

export const versionNumber = (output: string | undefined) => output?.match(/\d+(?:\.\d+)+/)?.[0];

/** Compares dotted version numbers segment by segment: negative when a is older than b. */
export function compareVersions(a: string, b: string) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export function verifiedLine(agent: CommandLineAgent, installed: string | undefined) {
  const verified = VERIFIED[agent];

  if (!verified) {
    return "verified: no release has been verified yet; run the sandbox or /verify-harness";
  }

  const number = versionNumber(installed);

  if (!number) {
    return `verified: ${verified.version} (${verified.date}); installed version unknown`;
  }

  const difference = compareVersions(number, verified.version);
  const note =
    difference > 0
      ? `; installed ${number} is newer and unverified`
      : difference < 0
        ? `; installed ${number} is older`
        : "";
  return `verified: ${verified.version} (${verified.date})${note}`;
}
