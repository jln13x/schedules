import { parseArgs } from "node:util";
import { Effect, Layer } from "effect";
import { Database } from "../src/db/database";
import { rankedSkills } from "../src/db/skills";
import { JevLayer } from "../src/lib/jev";
import { importSkills } from "../src/lib/skill-import";
import { SkillsSh } from "../src/lib/skills-sh";

const { values } = parseArgs({
  options: {
    pages: { type: "string", default: "1" },
    "per-page": { type: "string", default: "100" },
    budget: { type: "string", default: "100" },
  },
});

const program = Effect.gen(function* () {
  const summary = yield* importSkills({
    pages: Number(values.pages),
    perPage: Number(values["per-page"]),
    budget: Number(values.budget),
  });
  console.log(summary);
  const ranked = yield* rankedSkills({ limit: 30 });
  console.table(
    ranked.map((skill) => ({
      skill: skill.id,
      installs: skill.installs,
      useful: skill.usefulness,
      team: skill.forTeam?.toFixed(2),
      cadence: skill.cadence,
      audit: skill.audit ?? "-",
    })),
  );
});

await Effect.runPromise(
  program.pipe(Effect.provide(Layer.mergeAll(Database.layer, SkillsSh.layer, JevLayer))),
);
