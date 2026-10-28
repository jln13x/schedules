/**
 * Compares each command-line agent's newest release with the version this CLI was last verified
 * against: npm's latest for four of them, the installed version for Cursor, which isn't on npm.
 * Exit 1 when any agent has a newer release, so a schedule or CI job can trigger the sandbox, and
 * 2 when npm couldn't be read. Costs nothing: no model is called.
 */
import { COMMAND_LINE_AGENTS } from "../src/harnesses/agents.ts";
import { VERIFIED, compareVersions, versionNumber } from "../src/harnesses/verified.ts";

const PACKAGES: Record<(typeof COMMAND_LINE_AGENTS)[number], string | null> = {
  codex: "@openai/codex",
  "claude-code": "@anthropic-ai/claude-code",
  opencode: "opencode-ai",
  pi: "@earendil-works/pi-coding-agent",
  // Installed by a script from cursor.com, not published to npm.
  "cursor-agent": null,
};

async function latest(agent: (typeof COMMAND_LINE_AGENTS)[number]) {
  const name = PACKAGES[agent];

  if (name) {
    const response = await fetch(`https://registry.npmjs.org/${name}/latest`).catch(
      () => undefined,
    );
    return response?.ok ? ((await response.json()) as { version: string }).version : undefined;
  }

  const binary = Bun.which(agent);

  if (!binary) {
    return undefined;
  }

  const child = Bun.spawn([binary, "--version"], {
    stdout: "pipe",
    stderr: "ignore",
    stdin: "ignore",
  });
  return versionNumber(await new Response(child.stdout).text());
}

let newer = false;
let unreadable = false;
for (const agent of COMMAND_LINE_AGENTS) {
  const verified = VERIFIED[agent];
  const current = await latest(agent);
  const source = PACKAGES[agent] ? "npm" : "installed";
  const difference = current && verified ? compareVersions(current, verified.version) : 0;
  let status: string;

  if (!current && PACKAGES[agent]) {
    unreadable = true;
    status = "could not read npm";
  } else if (!current) {
    status = "not installed here; check cursor.com/changelog";
  } else if (!verified) {
    status = `${current} available, nothing verified yet`;
  } else if (difference > 0) {
    newer = true;
    status = `${current} is NEWER than verified ${verified.version} (${verified.date})`;
  } else if (difference < 0) {
    status = `${current} is older than verified ${verified.version} (${verified.date})`;
  } else {
    status = `${current} = verified ${verified.version} (${verified.date})`;
  }

  console.log(`${agent.padEnd(13)} ${source.padEnd(10)} ${status}`);
}
process.exit(unreadable ? 2 : newer ? 1 : 0);
