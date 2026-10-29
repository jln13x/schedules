import { Effect, Option } from "effect";
import { DecisionModel } from "effect/ai";
import { markFetched, saveClassification, skillsDue, upsertListedSkills } from "@/db/skills";
import {
  JEV_MODEL,
  SCHEDULABLE_THRESHOLD,
  Schedulable,
  schedulableInput,
  schedulableScores,
} from "./schedulable";
import { SkillsSh } from "./skills-sh";

export interface ImportOptions {
  /** Leaderboard pages to read, most installed first. */
  readonly pages: number;
  readonly perPage: number;
  /** Skills to fetch and, when their content changed, classify in this run. */
  readonly budget: number;
}

// skills.sh allows 600 requests a minute; four at a time stays well under it.
const CONCURRENCY = 4;

type Outcome = "classified" | "unchanged" | "missing" | "failed";

const refreshSkill = Effect.fn("refreshSkill")(function* (skill: {
  id: string;
  classifiedHash: string | null;
}) {
  const skillsSh = yield* SkillsSh;
  const detail = yield* skillsSh.skill(skill.id);

  if (Option.isNone(detail)) {
    yield* markFetched(skill.id, undefined);
    return "missing" satisfies Outcome;
  }

  const { hash, skillMd } = detail.value;
  const input = schedulableInput(skillMd);
  yield* markFetched(skill.id, { hash, description: input.description });

  if (hash === skill.classifiedHash) {
    return "unchanged" satisfies Outcome;
  }

  const { answers, modelId } = yield* DecisionModel.decide(Schedulable, { input });
  const scores = schedulableScores(answers);
  // Only skills that could be listed are worth an audit request.
  const audit =
    scores.recurring >= SCHEDULABLE_THRESHOLD ? yield* skillsSh.audit(skill.id) : Option.none();
  yield* saveClassification(skill.id, {
    hash,
    model: modelId ?? JEV_MODEL,
    ...scores,
    audit: Option.getOrNull(audit),
  });
  return "classified" satisfies Outcome;
});

/** Reads the skills.sh leaderboard, then fetches and classifies the skills that are due. */
export const importSkills = Effect.fn("importSkills")(function* (options: ImportOptions) {
  const skillsSh = yield* SkillsSh;
  let seen = 0;

  for (let page = 0; page < options.pages; page++) {
    const { data, pagination } = yield* skillsSh.leaderboard(page, options.perPage);
    seen += yield* upsertListedSkills(data);

    if (!pagination.hasMore) {
      break;
    }
  }

  const due = yield* skillsDue(options.budget);
  const outcomes = yield* Effect.forEach(
    due,
    (skill) =>
      refreshSkill(skill).pipe(
        Effect.catch((error) =>
          Effect.logWarning(`Skill import failed for ${skill.id}`, error).pipe(
            Effect.as("failed" satisfies Outcome),
          ),
        ),
      ),
    { concurrency: CONCURRENCY },
  );
  const count = (outcome: Outcome) => outcomes.filter((result) => result === outcome).length;
  return {
    seen,
    due: due.length,
    classified: count("classified"),
    unchanged: count("unchanged"),
    missing: count("missing"),
    failed: count("failed"),
  };
});
