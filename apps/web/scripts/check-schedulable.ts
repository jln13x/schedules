// Measures the Schedulable decision against hand-labelled skills from skills.sh.
// Needs TYPESAFE_API_KEY from .env.local and a fresh Vercel OIDC token for the skills.sh API.
// From the repository root, where the Vercel project is linked:
//   vercel env pull /tmp/oidc.env --environment=development
//   cd apps/web && VERCEL_OIDC_TOKEN="$(grep -oP '^VERCEL_OIDC_TOKEN="?\K[^"]+' /tmp/oidc.env)" \
//     bun scripts/check-schedulable.ts
import { Config, Effect, Redacted, Schema } from "effect";
import { DecisionModel } from "effect/ai";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
import { Schedulable, SCHEDULABLE_THRESHOLD, schedulableInput } from "../src/lib/schedulable";
import LABELS from "./schedulable-labels.json" with { type: "json" };

type Label = "yes" | "maybe" | "no";
const SkillFiles = Schema.Struct({
  files: Schema.NullOr(
    Schema.Array(Schema.Struct({ path: Schema.String, contents: Schema.String })),
  ),
});

const program = Effect.gen(function* () {
  const token = yield* Config.Redacted("VERCEL_OIDC_TOKEN");
  const skillsSh = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest((request) =>
      request.pipe(
        HttpClientRequest.prependUrl("https://skills.sh/api/v1"),
        HttpClientRequest.bearerToken(Redacted.value(token)),
      ),
    ),
    HttpClient.filterStatusOk,
  );
  const skillMd = (id: string) =>
    skillsSh.get(`/skills/${id}`).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(SkillFiles)),
      Effect.map(
        ({ files }) => files?.find((file) => /(^|\/)SKILL\.md$/i.test(file.path))?.contents,
      ),
    );

  const rows = yield* Effect.forEach(
    Object.entries(LABELS as Record<string, Label>),
    ([id, label]) =>
      Effect.gen(function* () {
        const source = yield* skillMd(id);

        if (!source) {
          return yield* Effect.fail(new Error("no SKILL.md"));
        }

        const { answers, usage } = yield* DecisionModel.decide(Schedulable, {
          input: schedulableInput(source),
        });
        return {
          id,
          label,
          probability: answers.recurring.probability,
          cadence: answers.cadence.label,
          tokens: usage.inputTokens ?? 0,
        };
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
  return rows.filter((row) => row !== undefined).toSorted((a, b) => b.probability - a.probability);
});

const rows = await Effect.runPromise(
  program.pipe(
    Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
    Effect.provide(TypeSafeClient.layerConfig()),
    Effect.provide(FetchHttpClient.layer),
  ),
);

const count = (list: typeof rows, label: Label) => list.filter((row) => row.label === label).length;
const good = rows.filter((row) => row.label === "yes");
const bad = rows.filter((row) => row.label === "no");
const wins = good.flatMap((a) =>
  bad.map((b) => (a.probability > b.probability ? 1 : a.probability === b.probability ? 0.5 : 0)),
);
console.log(
  `scored ${rows.length} skills, ${rows.reduce((sum, row) => sum + row.tokens, 0)} input tokens`,
);
console.log(
  `a good skill outranks a bad one ${((100 * wins.reduce((sum: number, win) => sum + win, 0)) / wins.length).toFixed(1)}% of the time`,
);
for (const threshold of [0.3, SCHEDULABLE_THRESHOLD, 0.7]) {
  const kept = rows.filter((row) => row.probability >= threshold);
  console.log(
    `at ${threshold}${threshold === SCHEDULABLE_THRESHOLD ? " (current)" : ""}: keeps ${count(kept, "yes")}/${good.length} good, ${count(kept, "maybe")} borderline, ${count(kept, "no")} bad`,
  );
}
console.log("\nbad skills scored highest:");
for (const row of bad.slice(0, 5)) {
  console.log(`  ${row.probability.toFixed(2)} ${row.id}`);
}
console.log("good skills scored lowest:");
for (const row of good.slice(-5)) {
  console.log(`  ${row.probability.toFixed(2)} ${row.id} (${row.cadence})`);
}
