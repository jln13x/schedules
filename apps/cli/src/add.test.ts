import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS_CLI, installArgs, parseSkillSource } from "./add.ts";

const CLI = fileURLToPath(new URL("cli.ts", import.meta.url));

describe("sources and install arguments", () => {
  test("take owner/repo/skill and owner/repo@skill, and nothing that could leave a folder", () => {
    expect(parseSkillSource("acme/tools/brief")).toEqual({
      owner: "acme",
      repo: "tools",
      skill: "brief",
    });
    expect(parseSkillSource("acme/tools@brief").skill).toBe("brief");
    expect(() => parseSkillSource("acme/tools")).toThrow("owner/repo/skill");
    expect(() => parseSkillSource("acme/../brief")).toThrow("owner/repo/skill");
  });

  test("leave the questions to a terminal, and answer them without one", () => {
    const source = { owner: "acme", repo: "tools", skill: "brief" };
    expect(installArgs(source, { global: false, interactive: true })).toEqual([
      "-y",
      SKILLS_CLI,
      "add",
      "acme/tools",
      "--skill",
      "brief",
    ]);
    expect(installArgs(source, { global: true, interactive: false })).toEqual([
      "-y",
      SKILLS_CLI,
      "add",
      "acme/tools",
      "--skill",
      "brief",
      "-g",
      "-y",
    ]);
  });
});

describe.skipIf(process.platform === "win32")("add", () => {
  let root = "";
  let server: Server | undefined;

  // Asynchronous, so the fake search server can answer while the CLI runs.
  const cli = (...args: Array<string>) =>
    new Promise<{ code: number | null; out: string }>((resolve) => {
      const child = spawn(process.execPath, [CLI, "add", ...args], {
        cwd: join(root, "repo"),
        env: {
          ...process.env,
          HOME: join(root, "home"),
          PATH: `${join(root, "bin")}:${process.env.PATH}`,
          AGENT_SCHEDULES_URL: `http://localhost:${(server?.address() as AddressInfo | null)?.port}`,
          DO_NOT_TRACK: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      child.stdout.on("data", (chunk) => (out += chunk));
      child.stderr.on("data", (chunk) => (out += chunk));
      child.on("close", (code) => resolve({ code, out }));
    });

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "agent-schedules-add-"));
    for (const dir of ["bin", "home", "repo"]) {
      mkdirSync(join(root, dir));
    }

    spawnSync("git", ["init", "-q"], { cwd: join(root, "repo") });
    // Stands in for the skills CLI: records its arguments and installs the skill the way it does.
    const npx = join(root, "bin", "npx");
    writeFileSync(
      npx,
      `#!/bin/sh
echo "$@" > "${root}/npx-args"
skill="$6"
mkdir -p ".agents/skills/$skill"
printf -- '---\\nname: %s\\ndescription: Brief me.\\n---\\n\\nBrief me.\\n' "$skill" > ".agents/skills/$skill/SKILL.md"
printf '{"version":1,"skills":{"%s":{"source":"%s"}}}' "$skill" "$4" > skills-lock.json
`,
    );
    chmodSync(npx, 0o755);
    server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          schedules: [
            {
              owner: "acme",
              repo: "tools",
              name: "brief",
              displayName: "brief",
              installs: 10,
              schedule: { cron: "0 8 * * 1-5", label: "Every weekday at 08:00" },
            },
          ],
        }),
      );
    });
    await new Promise<void>((resolve) => server?.listen(0, resolve));
  });

  afterAll(() => {
    server?.close();
    rmSync(root, { recursive: true, force: true });
  });

  test("installs through the skills CLI once, and schedules at the suggested time", async () => {
    const result = await cli("acme/tools/brief");
    expect(result.code).toBe(0);
    expect(readFileSync(join(root, "npx-args"), "utf8").trim()).toBe(
      `-y ${SKILLS_CLI} add acme/tools --skill brief -y`,
    );
    expect(result.out).toContain("create    brief");
    expect(readFileSync(join(root, "repo/.agents/schedules/brief.md"), "utf8")).toContain(
      "schedule: 0 8 * * 1-5\nskill: brief",
    );

    // Installed now, so a second add only changes the time.
    rmSync(join(root, "npx-args"));
    const again = await cli("acme/tools/brief", "--cron", "0 9 * * 1");
    expect(again.code).toBe(0);
    expect(again.out).toContain("installed brief");
    expect(again.out).toContain("update    brief");
    expect(() => readFileSync(join(root, "npx-args"))).toThrow();
  });

  test("a skill schedules.sh doesn't list needs --cron", async () => {
    const result = await cli("acme/tools/other");
    expect(result.code).toBe(1);
    expect(result.out).toContain("isn't listed on schedules.sh");
    expect(result.out).toContain("--cron");
  });
});
