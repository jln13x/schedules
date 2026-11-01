/**
 * Smoke-tests each installed command-line agent through this CLI: pushes a read and an edit
 * schedule into a throwaway repository, runs them exactly as cron would, and checks the
 * outcome, the agent's reply, and whether the file it was asked for appeared. Full access isn't
 * tested. cron is replaced by a fake crontab, so nothing is registered on the machine.
 * Each agent needs its own saved login or API key, and each run can make several model requests.
 * Exit 1 when any check fails.
 *
 *   bun scripts/marker-run.ts [agent...]      AS_MODEL_OPENCODE=provider/model is required for opencode
 *   KEEP=1 keeps the working folder for inspection.
 */
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { AGENTS, COMMAND_LINE_AGENTS } from "../src/harnesses/agents.ts";

type Agent = (typeof COMMAND_LINE_AGENTS)[number];
const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const CLI = resolve(import.meta.dir, "../src/cli.ts");
const only = process.argv.slice(2);
const marker = (agent: Agent, variant: string) => `SCHEDULES-VERIFY-${agent}-${variant}`;

// Under the home folder, not /tmp: some agents' read-only sandboxes still allow writes to temp.
const parent = join(homedir(), ".agent-schedules-verify");
await mkdir(parent, { recursive: true });
const root = await mkdtemp(join(parent, "marker-"));
const repo = await realpath(
  await mkdir(join(root, "repo"), { recursive: true }).then(() => join(root, "repo")),
);
const state = join(root, "state");
const bin = join(root, "bin");
await mkdir(bin);
await writeFile(
  join(bin, "crontab"),
  `#!/bin/sh\nif [ "$1" = "-l" ]; then [ -f "${root}/table" ] || { echo "no crontab" >&2; exit 1; }; cat "${root}/table"; else cat > "${root}/table"; fi\n`,
);
await chmod(join(bin, "crontab"), 0o755);
const env = {
  ...process.env,
  AGENT_SCHEDULES_HOME: state,
  AGENT_SCHEDULES_CRONTAB: join(bin, "crontab"),
  DO_NOT_TRACK: "1",
};

async function cli(args: ReadonlyArray<string>, timeoutMs = 60_000) {
  const child = Bun.spawn(["bun", CLI, ...args], {
    cwd: repo,
    env,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  // A child that ignores SIGTERM would otherwise keep the deadline from meaning anything.
  const killers = [
    setTimeout(() => child.kill("SIGTERM"), timeoutMs),
    setTimeout(() => child.kill("SIGKILL"), timeoutMs + 10_000),
  ];
  try {
    const [stdout, stderr] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode: await child.exited, output: `${stdout}${stderr}`.trim() };
  } finally {
    for (const killer of killers) {
      clearTimeout(killer);
    }
  }
}

const git = (...args: string[]) =>
  Bun.spawn(["git", "-c", "user.name=verify", "-c", "user.email=verify@example.com", ...args], {
    cwd: repo,
    stdout: "ignore",
    stderr: "ignore",
  }).exited;
await git("init", "-q");
await git("commit", "-q", "--allow-empty", "-m", "init");

async function jobFor(agent: Agent, name: string) {
  const jobs = join(state, "jobs");
  for (const id of await readdir(jobs).catch(() => [] as string[])) {
    const job = JSON.parse(await readFile(join(jobs, id, "job.json"), "utf8")) as {
      agent: string;
      name: string;
    };

    if (job.agent === agent && job.name === name) {
      return id;
    }
  }
  return undefined;
}

interface Row {
  agent: Agent;
  variant: "read" | "edit" | "skill" | "global";
  result: "PASS" | "FAIL" | "SKIP";
  detail: string;
}
const rows: Row[] = [];
const agents = COMMAND_LINE_AGENTS.filter((agent) => only.length === 0 || only.includes(agent));

for (const agent of agents) {
  const spec = AGENTS[agent];
  const binary = spec.binaries.map((name) => Bun.which(name)).find(Boolean);
  const model = process.env[`AS_MODEL_${agent.replaceAll("-", "_").toUpperCase()}`];

  if (!binary) {
    rows.push({ agent, variant: "read", result: "SKIP", detail: "not installed" });
    continue;
  }

  if (spec.requiresModel && !model) {
    rows.push({
      agent,
      variant: "read",
      result: "SKIP",
      detail: `set AS_MODEL_${agent.toUpperCase()}=provider/model`,
    });
    continue;
  }

  for (const variant of ["read", "edit"] as const) {
    const name = `verify-${agent}-${variant}`;
    const file = `${name}.txt`;
    const prompt = `Create a file named ${file} in the repository root containing the word ok. Then reply with the single line ${marker(agent, variant)}.`;
    await mkdir(join(repo, ".agents/schedules"), { recursive: true });
    await writeFile(
      join(repo, ".agents/schedules", `${name}.md`),
      `---\nname: ${name}\nschedule: 0 9 * * 1\n---\n\n${prompt}\n`,
    );
    const push = await cli([
      "push",
      agent,
      name,
      "--access",
      variant,
      ...(model ? ["--model", model] : []),
    ]);

    if (push.exitCode !== 0) {
      rows.push({
        agent,
        variant,
        result: "FAIL",
        detail: `push: ${push.output.split("\n").at(-1)}`,
      });
      continue;
    }

    const id = await jobFor(agent, name);

    if (!id) {
      rows.push({
        agent,
        variant,
        result: "FAIL",
        detail: "push reported success but no job was saved",
      });
      continue;
    }

    const started = Date.now();
    const run = await cli(["run", id, "--home", state], RUN_TIMEOUT_MS);
    const seconds = Math.round((Date.now() - started) / 1000);
    const last = await readFile(join(state, "jobs", id, "last.json"), "utf8")
      .then((text) => JSON.parse(text) as { outcome: string; log: string })
      .catch(() => undefined);
    const log = last ? await readFile(last.log, "utf8").catch(() => "") : "";
    const content = await readFile(join(repo, file), "utf8").catch(() => undefined);
    // Agents echo the prompt into the log, where the marker ends with a period; a reply doesn't.
    const replied = new RegExp(`${marker(agent, variant)}(?![.\\w-])`).test(
      log.replaceAll(prompt, ""),
    );
    const problems: string[] = [];

    if (!last) {
      problems.push("no last.json was written");
    } else if (last.outcome === "timeout") {
      problems.push("timed out");
    }

    if (variant === "edit") {
      if (last?.outcome !== "ok") {
        problems.push(`outcome ${last?.outcome ?? "unknown"} (exit ${run.exitCode})`);
      }

      if (content?.trim() !== "ok") {
        problems.push(`${file} was not written with "ok"`);
      }

      if (!replied) {
        problems.push("marker line missing from the log");
      }
    } else {
      if (content !== undefined) {
        problems.push(`${file} was written despite read access`);
      }

      // A run that never got going proves nothing about read access.
      if (last?.outcome !== "ok" && !replied) {
        problems.push(`outcome ${last?.outcome ?? "unknown"} (exit ${run.exitCode}) and no reply`);
      }
    }

    rows.push({
      agent,
      variant,
      result: problems.length === 0 ? "PASS" : "FAIL",
      detail:
        problems.length === 0
          ? `${seconds}s, outcome ${last?.outcome}, ${variant === "read" ? (replied ? "replied, no file" : "no file") : "file written, replied"}`
          : // The sandbox container is deleted afterwards, so the log's end goes in the report.
            `${problems.join("; ")}\n${log
              .trim()
              .split("\n")
              .slice(-12)
              .map((line) => `      | ${line}`)
              .join("\n")}`,
    });
  }
}

/**
 * Schedules an installed skill with `schedule` and runs it at read access, the default. Its answer
 * is only in a file beside SKILL.md, so a reply with it shows the agent read the skill's resources
 * under the permissions a scheduled run gets: from the repository, or from ~/.agents/skills.
 */
async function skillRun(agent: Agent, scope: "skill" | "global", model: string | undefined) {
  const token = `SCHEDULES-VERIFY-SKILL-${agent}-${scope}-${Math.random().toString(36).slice(2, 8)}`;
  const folder = `verify-${scope}-${agent}`;
  const dir =
    scope === "skill"
      ? join(repo, ".agents/skills", folder)
      : join(homedir(), ".agents/skills", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${folder}\ndescription: Replies with the line in marker.md.\n---\n\nRead marker.md in this folder and reply with its single line. Do not change any files.\n`,
  );
  await writeFile(join(dir, "marker.md"), `${token}\n`);

  // Committed, as a team would, so the skill is there for every checkout.
  if (scope === "skill") {
    await git("add", ".agents/skills");
    await git("commit", "-q", "-m", folder);
  }

  const name = `verify-${agent}-${scope}`;
  const scheduled = await cli(["schedule", dir, "0 9 * * 1", "--name", name]);
  const push =
    scheduled.exitCode === 0
      ? await cli(["push", agent, name, ...(model ? ["--model", model] : [])])
      : scheduled;

  // Agents confined to the repository at read access must refuse a global skill up front, rather
  // than push a task whose every run fails.
  if (scope === "global" && AGENTS[agent].confined?.includes("read")) {
    return push.exitCode !== 0 && push.output.includes("can't read files outside the repository")
      ? { result: "PASS" as const, detail: "push refused the global skill, as expected" }
      : {
          result: "FAIL" as const,
          detail: `push should refuse a global skill: ${push.output.split("\n").at(-1)}`,
        };
  }

  if (push.exitCode !== 0) {
    return {
      result: "FAIL" as const,
      detail: `schedule or push: ${push.output.split("\n").at(-1)}`,
    };
  }

  const id = await jobFor(agent, name);

  if (!id) {
    return { result: "FAIL" as const, detail: "push reported success but no job was saved" };
  }

  const started = Date.now();
  await cli(["run", id, "--home", state], RUN_TIMEOUT_MS);
  const seconds = Math.round((Date.now() - started) / 1000);
  const last = await readFile(join(state, "jobs", id, "last.json"), "utf8")
    .then((text) => JSON.parse(text) as { outcome: string; log: string })
    .catch(() => undefined);
  const log = last ? await readFile(last.log, "utf8").catch(() => "") : "";
  return log.includes(token)
    ? {
        result: "PASS" as const,
        detail: `${seconds}s, read ${scope === "skill" ? "the committed" : "the global"} skill's marker.md at read access`,
      }
    : {
        result: "FAIL" as const,
        detail: `no reply with the token from marker.md (outcome ${last?.outcome ?? "unknown"})\n${log
          .trim()
          .split("\n")
          .slice(-12)
          .map((line) => `      | ${line}`)
          .join("\n")}`,
      };
}

for (const agent of agents) {
  const model = process.env[`AS_MODEL_${agent.replaceAll("-", "_").toUpperCase()}`];

  if (!rows.some((row) => row.agent === agent && row.result === "SKIP")) {
    for (const scope of ["skill", "global"] as const) {
      rows.push({ agent, variant: scope, ...(await skillRun(agent, scope, model)) });
    }
  }
}

console.log(`\n${"AGENT".padEnd(13)} ${"CHECK".padEnd(6)} ${"RESULT".padEnd(6)} DETAIL`);
for (const row of rows) {
  console.log(
    `${row.agent.padEnd(13)} ${row.variant.padEnd(6)} ${row.result.padEnd(6)} ${row.detail}`,
  );
}
const failed = rows.some((row) => row.result === "FAIL");

if (failed || process.env.KEEP) {
  console.log(`\nWorking folder kept for inspection: ${root}`);
} else {
  await rm(root, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
