import { Effect, Layer, Option } from "effect";
import { DecisionModel } from "effect/ai";
import { FetchHttpClient } from "effect/http";
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
import {
  ABUSE_THRESHOLD,
  FIT_THRESHOLD,
  JEV_MODEL,
  Schedulable,
  SCHEDULABLE_THRESHOLD,
  schedulableInput,
  schedulableScores,
} from "../src/lib/schedulable";
import { SkillsSh } from "../src/lib/skills-sh";
import LABELS from "./schedulable-labels.json" with { type: "json" };

type Label = "yes" | "maybe" | "no";

const program = Effect.gen(function* () {
  const skillsSh = yield* SkillsSh;
  const rows = yield* Effect.forEach(
    Object.entries(LABELS as Record<string, Label>),
    ([id, label]) =>
      Effect.gen(function* () {
        const detail = yield* skillsSh.skill(id);

        if (Option.isNone(detail)) {
          return undefined;
        }

        const { answers, usage } = yield* DecisionModel.decide(Schedulable, {
          input: schedulableInput(detail.value.skillMd),
        });
        return { id, label, ...schedulableScores(answers), tokens: usage.inputTokens ?? 0 };
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            console.error(`skipped ${id}: ${String(error).split("\n")[0]}`);
            return undefined;
          }),
        ),
      ),
    { concurrency: 4 },
  );
  return rows.filter((row) => row !== undefined).toSorted((a, b) => b.recurring - a.recurring);
});

const rows = await Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.mergeAll(
        SkillsSh.layer,
        TypeSafeDecisionModel.layer({ model: JEV_MODEL }).pipe(
          Layer.provide(TypeSafeClient.layerConfig()),
          Layer.provide(FetchHttpClient.layer),
        ),
      ),
    ),
  ),
);

const count = (list: typeof rows, label: Label) => list.filter((row) => row.label === label).length;
const good = rows.filter((row) => row.label === "yes");
const bad = rows.filter((row) => row.label === "no");
const wins = good.flatMap((a) =>
  bad.map((b) => (a.recurring > b.recurring ? 1 : a.recurring === b.recurring ? 0.5 : 0)),
);
console.log(
  `${JEV_MODEL}: scored ${rows.length} skills, ${rows.reduce((sum, row) => sum + row.tokens, 0)} input tokens`,
);
console.log(
  `a good skill outranks a bad one ${((100 * wins.reduce((sum: number, win) => sum + win, 0)) / wins.length).toFixed(1)}% of the time`,
);
for (const threshold of [0.3, SCHEDULABLE_THRESHOLD, 0.7]) {
  const kept = rows.filter((row) => row.recurring >= threshold);
  console.log(
    `at ${threshold}${threshold === SCHEDULABLE_THRESHOLD ? " (current)" : ""}: keeps ${count(kept, "yes")}/${good.length} good, ${count(kept, "maybe")} borderline, ${count(kept, "no")} bad`,
  );
}
console.log(`\nabuse >= ${ABUSE_THRESHOLD}:`);
for (const row of rows.filter((row) => row.abuse >= ABUSE_THRESHOLD)) {
  console.log(`  ${row.abuse.toFixed(2)} ${row.id}`);
}
console.log("\nbad skills scored highest:");
for (const row of bad.slice(0, 5)) {
  console.log(`  ${row.recurring.toFixed(2)} ${row.id}`);
}
console.log(`\ngood skills (fits count at ${FIT_THRESHOLD}):`);
console.table(
  good.map((row) => ({
    skill: row.id,
    recurring: row.recurring.toFixed(2),
    useful: row.usefulness,
    team: row.forTeam.toFixed(2),
    abuse: row.abuse.toFixed(2),
    cadence: row.cadence,
    time: row.time,
  })),
);
