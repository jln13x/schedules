import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { location } from "./location.ts";
import { searchSkills } from "./registry.ts";
import { line } from "./report.ts";
import { timingFromCron } from "./schedule.ts";
import { scheduleSkill } from "./skill-schedule.ts";
import { type InstalledSkill, installedFrom } from "./skills.ts";

/**
 * Installing is left to skills.sh's own CLI, so the install counts there and lands where every
 * agent looks. Pinned to the version this CLI was tested with; its flags are checked by the sandbox.
 */
export const SKILLS_CLI = "skills@1.7.4";

export interface SkillSource {
  readonly owner: string;
  readonly repo: string;
  readonly skill: string;
}

/** owner/repo/skill as skills.sh links it, or owner/repo@skill as `npx skills use` writes it. */
export function parseSkillSource(value: string): SkillSource {
  const match = /^([\w.-]+)\/([\w.-]+)[/@]([\w.-]+)$/.exec(value.trim());
  const [, owner = "", repo = "", skill = ""] = match ?? [];

  if (!match || [owner, repo, skill].some((part) => part === "." || part === "..")) {
    throw new Error(`Expected owner/repo/skill, as on schedules.sh or skills.sh, got "${value}"`);
  }

  return { owner, repo, skill };
}

/** The `npx` arguments that install the skill; a terminal gets the skills CLI's own questions. */
export function installArgs(
  { owner, repo, skill }: SkillSource,
  { global, interactive }: { readonly global: boolean; readonly interactive: boolean },
): Array<string> {
  return [
    "-y",
    SKILLS_CLI,
    "add",
    `${owner}/${repo}`,
    "--skill",
    skill,
    ...(global ? ["-g"] : []),
    ...(interactive ? [] : ["-y"]),
  ];
}

function install(source: SkillSource, global: boolean, cwd: string) {
  const args = installArgs(source, { global, interactive: process.stdin.isTTY === true });
  return new Promise<void>((resolve, reject) => {
    spawn("npx", args, { cwd, stdio: "inherit" })
      .on("error", (error) => reject(new Error(`npx ${SKILLS_CLI}: ${error.message}`)))
      .on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`npx skills add exited ${code}; the skill wasn't installed`)),
      );
  });
}

/** The time schedules.sh suggests for the skill, which only listed skills have. */
async function suggestedCron({ owner, repo, skill }: SkillSource) {
  const found = (await searchSkills(`${owner}/${repo}/${skill}`)).find(
    (result) => result.owner === owner && result.repo === repo && result.name === skill,
  );

  if (!found) {
    throw new Error(
      `${owner}/${repo}/${skill} isn't listed on schedules.sh, so there is no suggested time; pass --cron, such as --cron "0 8 * * 1-5"`,
    );
  }

  return found.schedule.cron;
}

function single(installs: ReadonlyArray<InstalledSkill>): InstalledSkill | undefined {
  if (installs.length > 1) {
    throw new Error(
      `the skill is installed ${installs.length} times; schedule one by its folder with agent-schedules schedule <folder> <cron>:\n${installs.map((skill) => `  ${skill.path}`).join("\n")}`,
    );
  }

  return installs[0];
}

export interface AddOptions {
  readonly global: boolean;
  readonly dryRun: boolean;
  readonly cron?: string;
  readonly name?: string;
}

/**
 * Installs a skill from skills.sh unless it is installed already, and schedules it at the time
 * schedules.sh suggests. Resolves to the schedule's name.
 */
export async function add(value: string, options: AddOptions): Promise<string | undefined> {
  const source = parseSkillSource(value);
  const cron = options.cron ?? (await suggestedCron(source));
  const timing = timingFromCron(cron);

  if (typeof timing === "string") {
    throw new Error(timing);
  }

  const { dir, checkout } = await location(options.global);
  const repository = options.global ? null : checkout;
  let skill = single(await installedFrom(source, repository));

  if (skill) {
    line("installed", skill.name, skill.path);
  } else if (options.dryRun) {
    line(
      "install",
      source.skill,
      `npx ${installArgs(source, { global: options.global, interactive: false }).slice(1).join(" ")}`,
    );
    line("create", options.name ?? source.skill, cron);
    return undefined;
  } else {
    await install(source, options.global, checkout ?? homedir());
    skill = single(await installedFrom(source, repository));

    if (!skill) {
      throw new Error(
        `npx skills add finished, but ${source.skill} isn't in .agents/skills or .claude/skills; install it for an agent that reads one of them`,
      );
    }
  }

  return scheduleSkill(skill, timing, {
    dir,
    checkout,
    name: options.name,
    dryRun: options.dryRun,
  });
}
