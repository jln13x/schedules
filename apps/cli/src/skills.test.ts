import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installedSkills, resolveSkill, skillOutsideRepository, skillPrompt } from "./skills.ts";

const CLI = fileURLToPath(new URL("cli.ts", import.meta.url));
let root: string;
let home: string;
let repo: string;

function install(base: string, folder: string, name = folder) {
  mkdirSync(join(base, folder), { recursive: true });
  writeFileSync(
    join(base, folder, "SKILL.md"),
    `---\nname: ${name}\ndescription: Does ${name}.\n---\n\n# ${name}\n`,
  );
  writeFileSync(join(base, folder, "notes.md"), "resource\n");
}

const schedule = (...args: Array<string>) =>
  execFileSync(process.execPath, [CLI, "schedule", ...args], {
    cwd: repo,
    env: { ...process.env, HOME: home, DO_NOT_TRACK: "1" },
    encoding: "utf8",
  });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agent-schedules-skills-"));
  home = join(root, "home");
  repo = join(root, "repo");
  mkdirSync(home);
  mkdirSync(repo);
  execFileSync("git", ["init", "-q"], { cwd: repo });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("installed skills", () => {
  test("a skill linked into an agent folder counts once, at its canonical path", async () => {
    install(join(repo, ".agents/skills"), "triage");
    mkdirSync(join(repo, ".claude/skills"), { recursive: true });
    symlinkSync("../../.agents/skills/triage", join(repo, ".claude/skills/triage"));
    writeFileSync(
      join(repo, "skills-lock.json"),
      JSON.stringify({ version: 1, skills: { triage: { source: "acme/skills" } } }),
    );

    const skills = await installedSkills(repo, home);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "triage",
      path: ".agents/skills/triage",
      scope: "project",
      source: "acme/skills",
    });
    expect((await resolveSkill("acme/skills/triage", repo, home)).name).toBe("triage");
    expect((await resolveSkill("acme/skills@triage", repo, home)).name).toBe("triage");
  });

  test("global skills are reached under ~, and the frontmatter name wins over the folder", async () => {
    install(join(home, ".agents/skills"), "weekly-digest", "Weekly digest");
    const skill = await resolveSkill("Weekly digest", repo, home);
    expect(skill).toMatchObject({ path: "~/.agents/skills/weekly-digest", scope: "global" });
    expect(await resolveSkill("weekly-digest", repo, home)).toEqual(skill);
    expect(skillPrompt(skill)).toContain("read ~/.agents/skills/weekly-digest/SKILL.md");
  });

  test("one name installed twice is refused, and a path picks one", async () => {
    install(join(repo, ".agents/skills"), "triage");
    install(join(home, ".agents/skills"), "triage");
    await expect(resolveSkill("triage", repo, home)).rejects.toThrow(
      "could mean 2 installed skills",
    );
    expect((await resolveSkill(join(repo, ".agents/skills/triage"), repo, home)).scope).toBe(
      "project",
    );
  });

  test("a missing skill says what is installed and how to install it", async () => {
    install(join(repo, ".agents/skills"), "triage");
    await expect(resolveSkill("standup", repo, home)).rejects.toThrow(
      "no installed skill named standup. Installed here: triage. Install it first",
    );
  });
});

describe("schedule", () => {
  test("writes a schedule that runs the skill, and changes only its timing later", () => {
    install(join(repo, ".agents/skills"), "triage");
    expect(schedule("triage", "0 8 * * 1-5")).toContain("create    triage");
    const path = join(repo, ".agents/schedules/triage.md");
    expect(readFileSync(path, "utf8")).toBe(
      [
        "---",
        "name: triage",
        "schedule: 0 8 * * 1-5",
        "skill: triage",
        "---",
        "",
        "Use the triage skill: read .agents/skills/triage/SKILL.md and follow it. The files it refers to are in .agents/skills/triage/.",
        "",
        "This run was started on a schedule and nobody is watching it, so don't wait for answers: make reasonable choices and say what you did.",
        "",
      ].join("\n"),
    );

    writeFileSync(
      path,
      readFileSync(path, "utf8").replace("Use the triage", "Please use the triage"),
    );
    expect(schedule("triage", "0 8 1 * *")).toContain(
      "Monthly on the 1st 08:00, kept its edited prompt",
    );
    expect(readFileSync(path, "utf8")).toContain("schedule: 0 8 1 * *\nskill: triage");
    expect(readFileSync(path, "utf8")).toContain("Please use the triage");
    expect(schedule("triage", "0 8 1 * *")).toContain("unchanged triage");
  });

  test("warns when the skill isn't committed, and refuses a name another schedule holds", () => {
    install(join(repo, ".agents/skills"), "triage");
    expect(schedule("triage", "0 8 * * 1-5")).toContain("isn't committed");
    mkdirSync(join(repo, ".agents/schedules"), { recursive: true });
    writeFileSync(
      join(repo, ".agents/schedules/standup.md"),
      "---\nname: standup\nschedule: 0 9 * * *\n---\n\nRun standup.\n",
    );
    install(join(repo, ".agents/skills"), "standup");
    expect(() => schedule("standup", "0 9 * * *")).toThrow("pass --name");
    expect(schedule("standup", "0 9 * * *", "--name", "Standup skill")).toContain(
      "create    Standup skill",
    );
  });

  test("rejects a cron the format can't hold before looking for the skill", () => {
    expect(() => schedule("nothing", "*/5 * * * *")).toThrow("not a time of day");
  });
});

const promptFor = (path: string) =>
  skillPrompt({ name: "x", folder: "x", dir: "/x", path, scope: "global" });

test("a skill outside the repository is found in the prompt schedule wrote", () => {
  const timing = { minute: 0, hour: 8, weekdays: null };
  expect(
    skillOutsideRepository({
      name: "x",
      timing,
      prompt: promptFor("~/.agents/skills/x"),
      skill: "x",
    }),
  ).toBe("~/.agents/skills/x");
  expect(
    skillOutsideRepository({
      name: "x",
      timing,
      prompt: promptFor(".agents/skills/x"),
      skill: "x",
    }),
  ).toBeUndefined();
  expect(
    skillOutsideRepository({ name: "x", timing, prompt: promptFor("~/.agents/skills/x") }),
  ).toBeUndefined();
});
