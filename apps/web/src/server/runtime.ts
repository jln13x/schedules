import { type Effect, Layer, ManagedRuntime } from "effect";
import type { DecisionModel } from "effect/ai";
import { Database } from "@/db/database";
import { Discord } from "@/lib/discord";
import { JevLayer } from "@/lib/jev";
import { RateLimit } from "@/lib/rate-limit";
import { SkillsSh } from "@/lib/skills-sh";
import { Billing } from "@/lib/stripe";

export type Services =
  | Database
  | RateLimit
  | Discord
  | Billing
  | SkillsSh
  | DecisionModel.DecisionModel;

const AppLayer = Layer.mergeAll(
  Database.layer,
  RateLimit.layer,
  Discord.layer,
  Billing.layer,
  SkillsSh.layer,
  JevLayer,
);

// Next loads route handlers and pages as separate module copies; one process-wide runtime keeps
// them on the same connections.
const GLOBAL = globalThis as typeof globalThis & {
  schedulesRuntime?: ManagedRuntime.ManagedRuntime<Services, never>;
};
const runtime = (GLOBAL.schedulesRuntime ??= ManagedRuntime.make(AppLayer));

/** Runs server code at a Next boundary: a page, route handler, or server action. */
export const run = <A, E>(effect: Effect.Effect<A, E, Services>) => runtime.runPromise(effect);
