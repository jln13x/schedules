import { Schema } from "effect";
import { Decision } from "effect/ai";
import { parse as parseYaml } from "yaml";

/**
 * Asks a decision model whether a skill from skills.sh makes a good recurring task, and how often.
 * `scripts/check-schedulable.ts` measures it against hand-labelled skills; rerun it after changing
 * the wording or the threshold.
 */
/** Pinned so a TypeSafe release can't change the directory's verdicts without a rerun of the check. */
export const JEV_MODEL = "jev-1.14.0";

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
    usefulness: Decision.rate({
      instructions:
        "How much does someone gain from having this run on a schedule, compared with running it by hand when they think of it?",
      criteria: [
        {
          label: "marginal",
          description: "Little gained; running it by hand when needed is just as good",
        },
        { label: "handy", description: "Saves a small, regular chore" },
        {
          label: "valuable",
          description: "Catches or prepares something that would otherwise be missed or late",
        },
        {
          label: "essential",
          description:
            "The main point of the skill is to run regularly; by hand it mostly would not happen",
        },
      ],
    }),
    audience: Decision.classify({
      instructions:
        "If a whole team used this skill on a schedule, who should run it? Judge by what it acts on: a person's own work, accounts, or interests, versus shared things such as a codebase, its pull requests and issues, infrastructure, or a team channel.",
      criteria: {
        each: "Each person runs it for themselves and gets a result of their own",
        once: "One run serves the whole team; separate runs would duplicate work on shared things",
      },
    }),
    abuse: Decision.probability({
      instructions:
        "The skill's purpose is to evade detection or rate limits, circumvent a service's rules or terms, impersonate people, generate spam, or otherwise act against the interests of other people or platforms",
      criteria: {
        false: "An ordinary tool; any scraping or automation respects the services it touches",
        true: "Built to get around protections or rules that others rely on",
      },
    }),
    cadence: Decision.classify({
      instructions: "If it ran on a schedule, how often would running it be most useful?",
      criteria: {
        daily: "Every day, including weekends",
        weekdays: "Every working day",
        weekly: "Once a week",
        monthly: "Once a month, or less often",
      },
    }),
    time: Decision.classify({
      instructions:
        "At what time of the working day is its result most useful? It runs on the person's own computer, which may be asleep at night.",
      criteria: {
        morning: "At the start of the day, to prepare or brief before work begins",
        midday: "Around midday, when timing does not matter much",
        evening: "At the end of the day, to wrap up, summarize, or back up the day's work",
      },
    }),
  },
});

/** Jev's answers reduced to what the directory stores: probabilities, and usefulness as 0 to 100. */
export function schedulableScores(answers: Decision.Answers<typeof Schedulable.decisions>) {
  const levels = Schedulable.decisions.usefulness.criteria.length - 1;
  return {
    recurring: answers.recurring.probability,
    usefulness: Math.round((100 * answers.usefulness.rating) / levels),
    forTeam: answers.audience.probabilities.once,
    abuse: answers.abuse.probability,
    cadence: answers.cadence.label,
    time: answers.time.label,
  };
}

/** On the labelled set, 0.5 keeps 19 or 20 of 22 good skills and one or two of 91 bad ones. */
export const SCHEDULABLE_THRESHOLD = 0.5;

/**
 * A skill shows under a fit when that answer's share is at least this, so a skill Jev splits
 * evenly between "each person runs it" and "one run serves the team" appears under both.
 */
export const FIT_THRESHOLD = 0.4;

/** Skills at or above this are kept out of the directory however well they would schedule. */
export const ABUSE_THRESHOLD = 0.5;
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
