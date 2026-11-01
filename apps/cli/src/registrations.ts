import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { readJson, writeJsonAtomic } from "./harness.ts";
import { runnerHome, withLock } from "./harnesses/cron/jobs.ts";
import { type Schedule, serializeSchedule } from "./schedule.ts";

/**
 * Which native task a schedule file was pushed to. The file stays in the repository; this binding
 * belongs to the machine whose scheduler holds the task, so it lives in this CLI's state folder.
 */
const registrationSchema = Schema.Struct({
  harness: Schema.String,
  nativeId: Schema.String,
  /** The folder the task runs in, as the harness knows it. */
  workspace: Schema.String,
  /** The schedule file, as an absolute path. */
  source: Schema.String,
  name: Schema.String,
  host: Schema.String,
  /** What was last pushed or pulled, to tell an edit in the scheduler from one in the file. */
  pushed: Schema.String,
  updatedAt: Schema.String,
});
export type Registration = typeof registrationSchema.Type;

const registrationsSchema = Schema.Struct({
  version: Schema.Literal(1),
  registrations: Schema.Array(registrationSchema),
});

// Kept apart from registrations, so removing the last task pushed to a host still lists the tasks
// made there by hand.
const hostsSchema = Schema.Struct({
  version: Schema.Literal(1),
  hosts: Schema.Array(Schema.Struct({ host: Schema.String, addedAt: Schema.String })),
});

const registrationsPath = () => join(runnerHome(), "registrations.json");
const hostsPath = () => join(runnerHome(), "hosts.json");

/** A fingerprint of what a schedule runs; harnesses don't keep the skill it came from. */
export const scheduleHash = (schedule: Schedule) =>
  createHash("sha256")
    .update(serializeSchedule({ ...schedule, skill: undefined }))
    .digest("hex");

export const readRegistrations = Effect.suspend(() =>
  readJson(registrationsPath(), registrationsSchema, { version: 1, registrations: [] }),
).pipe(Effect.map(({ registrations }) => registrations));

const sameTask = (left: Registration, right: Pick<Registration, "harness" | "nativeId">) =>
  left.harness === right.harness && left.nativeId === right.nativeId;

/** Edits the registrations under a lock, so two processes don't drop each other's changes. */
const editRegistrations = (
  edit: (registrations: ReadonlyArray<Registration>) => ReadonlyArray<Registration>,
) =>
  withLock(
    "registrations",
    Effect.gen(function* () {
      const registrations = edit(yield* readRegistrations);
      yield* writeJsonAtomic(registrationsPath(), { version: 1, registrations });
    }),
  );

/** Records that a file now drives this task, in place of whatever drove it before. */
export const register = (
  entry: Omit<Registration, "host" | "updatedAt" | "pushed"> & { readonly schedule: Schedule },
) => {
  const { schedule, ...rest } = entry;
  const registration: Registration = {
    ...rest,
    host: hostname(),
    pushed: scheduleHash(schedule),
    updatedAt: new Date().toISOString(),
  };
  return editRegistrations((registrations) => [
    ...registrations.filter(
      (candidate) =>
        !sameTask(candidate, registration) &&
        !(
          candidate.harness === registration.harness &&
          candidate.workspace === registration.workspace &&
          candidate.source === registration.source
        ),
    ),
    registration,
  ]);
};

export const unregister = (task: Pick<Registration, "harness" | "nativeId">) =>
  editRegistrations((registrations) =>
    registrations.filter((candidate) => !sameTask(candidate, task)),
  );

export const readHosts = Effect.suspend(() =>
  readJson(hostsPath(), hostsSchema, { version: 1, hosts: [] }),
).pipe(Effect.map(({ hosts }) => hosts.map((entry) => entry.host)));

const editHosts = (edit: (hosts: ReadonlyArray<string>) => ReadonlyArray<string>) =>
  withLock(
    "hosts",
    Effect.gen(function* () {
      const stored = yield* readJson(hostsPath(), hostsSchema, { version: 1, hosts: [] });
      const kept = new Set(edit(stored.hosts.map((entry) => entry.host)));
      const now = new Date().toISOString();
      yield* writeJsonAtomic(hostsPath(), {
        version: 1,
        hosts: [...kept].map(
          (host) => stored.hosts.find((entry) => entry.host === host) ?? { host, addedAt: now },
        ),
      });
    }),
  );

export const rememberHost = (host: string) =>
  editHosts((hosts) => (hosts.includes(host) ? hosts : [...hosts, host]));

export const forgetHost = (host: string) =>
  editHosts((hosts) => hosts.filter((candidate) => candidate !== host));
