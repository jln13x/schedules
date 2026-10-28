import { randomBytes } from "node:crypto";
import { delimiter, dirname, join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import {
  Context,
  Data,
  Effect,
  FileSystem,
  Layer,
  type PlatformError,
  Predicate,
  Schema,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import type { Access } from "./harnesses/cron/agent.ts";
import type { Schedule } from "./schedule.ts";

/** A failure to report to the user as is. */
export class HarnessError extends Data.TaggedError("HarnessError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** What the adapters touch on this machine; tests can provide fakes. */
export type Platform = FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner;

/** The repository a harness is synced for, and the push options that apply to it. */
export class Workspace extends Context.Service<
  Workspace,
  {
    readonly cwd: string;
    /** Model for new tasks, for harnesses that let you choose one. */
    readonly model?: string | undefined;
    /** What scheduled runs may do, for harnesses this CLI schedules itself. */
    readonly access?: Access | undefined;
  }
>()("agent-schedules/Workspace") {}

type Status = "active" | "paused" | "not scheduled";

interface LastRun {
  readonly at: Date;
  /** Known when this CLI or T3 ran it; the other apps only record when a run started. */
  readonly outcome?: "ok" | "failed" | "timeout" | undefined;
}

export type LiveSchedule = {
  readonly name: string;
  readonly status: Status;
  readonly lastRun?: LastRun | undefined;
  /** Settings a push can change without touching the schedule; known for command-line agents. */
  readonly model?: string | undefined;
  readonly access?: Access | undefined;
} & ({ readonly schedule: Schedule } | { readonly unsupported: string });

export interface SetupStep {
  readonly description: string;
  readonly run: Effect.Effect<void, HarnessError>;
}

/** One place schedules can run. Each harness provides it as a layer, so callers can swap them. */
export class Harness extends Context.Service<
  Harness,
  {
    readonly list: Effect.Effect<ReadonlyArray<LiveSchedule>, HarnessError>;
    /** Runs once before the first save; previews list it without running it. */
    readonly setup: ReadonlyArray<SetupStep>;
    /** Why saving would fail, checked in previews as well, so a dry run catches it. */
    readonly check: (
      schedule: Schedule,
      existing: boolean,
    ) => Effect.Effect<string | undefined, HarnessError>;
    /** Resolves to a short note when the outcome needs one, such as whether the app loaded it. */
    readonly save: (schedule: Schedule) => Effect.Effect<string | undefined, HarnessError>;
    readonly caveat?: string | undefined;
  }
>()("agent-schedules/Harness") {}

type Diagnosis = ReadonlyArray<string>;

/** A harness: how to connect to it, and how to explain its setup when that fails. */
export interface HarnessDefinition {
  readonly layer: Layer.Layer<Harness, HarnessError, Workspace | Platform>;
  readonly doctor: Effect.Effect<Diagnosis, HarnessError, Workspace | Platform>;
}

/** Runs an effect against this machine's files and processes. */
export const run = <A>(effect: Effect.Effect<A, HarnessError, Platform>) =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer));

/** Connects to a harness for a repository; the methods it returns run on their own. */
export const connect = (definition: HarnessDefinition, workspace: Workspace["Service"]) =>
  run(
    Effect.gen(function* () {
      return yield* Harness;
    }).pipe(
      Effect.provide(
        definition.layer.pipe(Layer.provide(Layer.succeed(Workspace, Workspace.of(workspace)))),
      ),
    ),
  );

export const fail = (message: string, cause?: unknown) =>
  Effect.fail(new HarnessError({ message, cause }));

const describeCause = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export const attempt = <A>(what: string, run: (signal: AbortSignal) => PromiseLike<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new HarnessError({ message: `${what}: ${describeCause(cause)}`, cause }),
  });

export const decode = <T>(schema: Schema.Decoder<T>, value: unknown, what: string) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((cause) => new HarnessError({ message: `${what}: ${cause.message}`, cause })),
  );

/** A struct that keeps the fields it doesn't declare, for files written back to their owner. */
export const loose = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(Schema.Struct(fields), [Schema.Record(Schema.String, Schema.Unknown)]);

const platformError =
  (what: string) =>
  (cause: { readonly message: string }): HarnessError =>
    new HarnessError({ message: `${what}: ${cause.message}`, cause });

const missing = ({ reason }: PlatformError.PlatformError) =>
  Predicate.isTagged(reason, "NotFound") || Predicate.isTagged(reason, "BadResource");

export const exists = Effect.fn(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false));
});

export const readText = Effect.fn(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(path).pipe(Effect.mapError(platformError(`read ${path}`)));
});

/** The file's text, or undefined when there is no such file. */
export const readTextIfExists = Effect.fn(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(path).pipe(
    Effect.map((text): string | undefined => text),
    Effect.catchIf(missing, () => Effect.succeed(undefined)),
    Effect.mapError(platformError(`read ${path}`)),
  );
});

/** Writes a file; with a mode, as a fresh private file in place of whatever was at that path. */
export const writeText = Effect.fn(
  function* (path: string, text: string, mode?: number) {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(dirname(path), { recursive: true });

    if (mode === undefined) {
      yield* fs.writeFileString(path, text);
      return;
    }

    // Removing first means an existing file's looser mode, or a link planted there, doesn't carry over.
    yield* fs.remove(path, { force: true });
    yield* fs.writeFileString(path, text, { mode, flag: "wx" });
  },
  Effect.mapError(platformError("write")),
);

/** Writes through a temporary file, so a reader never sees half of it. */
export const writeJsonAtomic = Effect.fn(
  function* (path: string, value: unknown, mode = 0o600) {
    const fs = yield* FileSystem.FileSystem;
    const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    yield* fs.makeDirectory(dirname(path), { recursive: true });
    yield* fs.writeFileString(temp, `${JSON.stringify(value, null, 2)}\n`, { mode, flag: "wx" });
    yield* fs.rename(temp, path);
  },
  Effect.mapError(platformError("write")),
);

export const parseJson = (text: string, what: string) =>
  Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: (cause) => new HarnessError({ message: `${what}: ${describeCause(cause)}`, cause }),
  });

/** Parses a JSON file, or returns the fallback when the file is missing and one is given. */
export const readJson = <S extends Schema.Codec<unknown, unknown, never, never>>(
  path: string,
  schema: S,
  fallback?: S["Type"],
): Effect.Effect<S["Type"], HarnessError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const text = yield* fallback === undefined ? readText(path) : readTextIfExists(path);

    if (text === undefined) {
      return fallback as S["Type"];
    }

    return yield* decode(Schema.fromJsonString(schema), text, path);
  });

/** A directory's entries, or none when it doesn't exist. */
export const listDirectory = Effect.fn(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readDirectory(path).pipe(
    Effect.catchIf(missing, () => Effect.succeed<ReadonlyArray<string>>([])),
    Effect.mapError(platformError(`list ${path}`)),
  );
});

export const makeDirectory = Effect.fn(function* (path: string, mode?: number) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .makeDirectory(path, { recursive: true, mode })
    .pipe(Effect.mapError(platformError(`create ${path}`)));

  // A folder that already existed keeps its mode through makeDirectory.
  if (mode !== undefined) {
    yield* fs.chmod(path, mode).pipe(Effect.mapError(platformError(`chmod ${path}`)));
  }
});

export const removePath = Effect.fn(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .remove(path, { recursive: true, force: true })
    .pipe(Effect.mapError(platformError(`remove ${path}`)));
});

export const findOnPath = Effect.fn(function* (binary: string) {
  const fs = yield* FileSystem.FileSystem;
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, binary);
    const executable = yield* fs.access(candidate, { ok: true }).pipe(
      Effect.flatMap(() => fs.stat(candidate)),
      Effect.map((info) => info.type === "File" && (Number(info.mode) & 0o111) !== 0),
      Effect.orElseSucceed(() => false),
    );

    if (executable) {
      return candidate;
    }
  }

  return undefined;
});

export interface ExecOptions {
  readonly cwd?: string | undefined;
  readonly env?: Record<string, string | undefined> | undefined;
  /** Whether env adds to this process's environment rather than replacing it; it adds by default. */
  readonly extendEnv?: boolean | undefined;
  /** Written to stdin, which is otherwise closed so nothing waits for input. */
  readonly input?: string | undefined;
}

interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const collect = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  stream.pipe(Stream.decodeText(), Stream.mkString);

/** Runs a command to completion and returns its exit code and output, whatever the exit code. */
export const execRaw = Effect.fn(
  function* (command: string, args: ReadonlyArray<string>, options: ExecOptions = {}) {
    const handle = yield* ChildProcess.make(command, args, {
      cwd: options.cwd,
      env: options.env,
      extendEnv: options.extendEnv ?? true,
      stdin:
        options.input === undefined
          ? "ignore"
          : Stream.make(new TextEncoder().encode(options.input)),
      // A caller's timeout ends the process; without a limit, one that ignores SIGTERM would hang it.
      killSignal: "SIGTERM",
      forceKillAfter: "10 seconds",
    });
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [collect(handle.stdout), collect(handle.stderr), handle.exitCode],
      { concurrency: "unbounded" },
    );
    return { exitCode: Number(exitCode), stdout, stderr } satisfies ExecResult;
  },
  (effect, command) => Effect.scoped(effect).pipe(Effect.mapError(platformError(command))),
);

/** Runs a command and returns its stdout, failing with its stderr when it exits non-zero. */
export const exec = Effect.fn(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: ExecOptions = {},
) {
  const result = yield* execRaw(command, args, options);

  if (result.exitCode !== 0) {
    return yield* fail(
      `${command} ${args[0] ?? ""} failed: ${result.stderr.trim() || `exit code ${result.exitCode}`}`,
    );
  }

  return result.stdout;
});
