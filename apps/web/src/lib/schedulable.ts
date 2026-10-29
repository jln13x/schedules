import { Schema } from "effect";
import { Decision } from "effect/ai";
import { parse as parseYaml } from "yaml";

/**
 * Asks a decision model whether a skill from skills.sh makes a good recurring task, and how often.
 * `scripts/check-schedulable.ts` measures it against hand-labelled skills; rerun it after changing
 * the wording or the threshold.
 */
export const Schedulable = Decision.make({
  input: Schema.Struct({
    name: Schema.String,
    description: Schema.String,
    instructions: Schema.String,
  }),
  decisions: {
    recurring: Decision.probability({
      // Almost every skill describes itself as "use when the user asks...", which reads as
      // on-demand; without the second sentence the model rejects standups and status reports.
      instructions:
        "Running this skill automatically on a fixed schedule (for example every weekday morning), with nobody watching, produces a useful result on its own. Skill descriptions are written as 'use when the user asks...'; judge the work the skill does, not that phrasing. A skill that gathers, summarizes, checks, reports on, or cleans up recent activity qualifies even if a person usually triggers it by hand.",
      criteria: {
        false:
          "Only useful when a person asks for something specific, supplies input, or answers questions",
        true: "Useful as a recurring job: it checks, summarizes, reports, cleans up, or maintains something by itself",
      },
    }),
    cadence: Decision.classify({
      instructions: "If it ran on a schedule, how often would running it be most useful?",
      criteria: {
        daily: "Every day",
        weekdays: "Every weekday morning",
        weekly: "Once a week",
        monthly: "Once a month",
      },
    }),
  },
});

/** On the labelled set, 0.5 keeps 19 or 20 of 22 good skills and one or two of 91 bad ones; answers vary slightly between runs. */
export const SCHEDULABLE_THRESHOLD = 0.5;

/** Enough of a skill's instructions to judge it; the rest is detail that costs tokens. */
const INSTRUCTIONS_LIMIT = 6000;

const text = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

/** The decision input for a SKILL.md: frontmatter name and description, then the start of the body. */
export function schedulableInput(skillMd: string): typeof Schedulable.input.Type {
  const front = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const head = (() => {
    try {
      const value: unknown = parseYaml(front?.[1] ?? "");
      return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  })();
  return {
    name: text(head.name),
    description: text(head.description),
    instructions: skillMd.slice(front?.[0].length ?? 0).slice(0, INSTRUCTIONS_LIMIT),
  };
}
