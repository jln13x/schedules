import { type Effect, Layer, ManagedRuntime } from "effect";
import { Database } from "@/db/database";
import { Discord } from "@/lib/discord";
import { GitHub } from "@/lib/github";
import { RateLimit } from "@/lib/rate-limit";
import { Billing } from "@/lib/stripe";

export type Services = Database | GitHub | RateLimit | Discord | Billing;

const AppLayer = Layer.mergeAll(
  Database.layer,
  GitHub.layer,
  RateLimit.layer,
  Discord.layer,
  Billing.layer,
);

// Next loads route handlers and pages as separate module copies; one process-wide runtime keeps
// them on the same connections.
const GLOBAL = globalThis as typeof globalThis & {
  schedulesRuntime?: ManagedRuntime.ManagedRuntime<Services, never>;
};
const runtime = (GLOBAL.schedulesRuntime ??= ManagedRuntime.make(AppLayer));

/** Runs server code at a Next boundary: a page, route handler, or server action. */
export const run = <A, E>(effect: Effect.Effect<A, E, Services>) => runtime.runPromise(effect);
