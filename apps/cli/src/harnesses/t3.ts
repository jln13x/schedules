import { homedir } from "node:os";
import { join } from "node:path";
import { Effect, Layer, Option, Result, Schema } from "effect";
import {
  type HarnessDefinition,
  type LiveSchedule,
  type Platform,
  type SetupStep,
  Harness,
  HarnessError,
  Workspace,
  attempt,
  decode,
  exec,
  exists,
  fail,
  findOnPath,
  loose,
  parseJson,
  readJson,
} from "../harness.ts";
import { type Schedule, type Timing, normalizeWeekdays } from "../schedule.ts";

const PROTOCOL_VERSION = "2";
const t3Home = () => process.env.T3CODE_HOME ?? join(homedir(), ".t3");

const fixedTimeSchema = Schema.Struct({
  type: Schema.Literal("fixed_time"),
  timeOfDay: Schema.String.check(Schema.isPattern(/^([01]?\d|2[0-3]):[0-5]\d$/)),
  weekdays: Schema.optional(
    Schema.NullOr(Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })))),
  ),
});
const decodeFixedTime = Schema.decodeUnknownOption(fixedTimeSchema);
const decodeTrigger = Schema.decodeUnknownOption(
  Schema.Struct({ type: Schema.optionalKey(Schema.String) }),
);

const taskSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  prompt: Schema.String,
  enabled: Schema.Boolean,
  schedule: loose({ type: Schema.String }),
  projectId: Schema.String,
  createdBy: Schema.Unknown,
  creationSource: Schema.Unknown,
  threadId: Schema.NullOr(Schema.String),
  workspaceStrategy: Schema.Unknown,
  modelSelection: Schema.Unknown,
  runtimeMode: Schema.String,
  interactionMode: Schema.String,
  // Older T3 versions don't report runs.
  lastRunAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
  lastRunStatus: Schema.optionalKey(Schema.String),
});
type Task = typeof taskSchema.Type;

// Kept whole, since a new task gets the project's selection as it is, options included.
const modelSelectionSchema = loose({ instanceId: Schema.String, model: Schema.String });
type ModelSelection = typeof modelSelectionSchema.Type;
const decodeModelSelection = Schema.decodeUnknownOption(modelSelectionSchema);

const projectSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  workspaceRoot: Schema.String,
  defaultModelSelection: Schema.NullOr(modelSelectionSchema),
});
type Project = typeof projectSchema.Type;

const configSchema = Schema.Struct({
  providers: Schema.Array(
    Schema.Struct({
      instanceId: Schema.String,
      enabled: Schema.Boolean,
      status: Schema.String,
      models: Schema.Array(
        Schema.Struct({ slug: Schema.String, isLegacy: Schema.optionalKey(Schema.Boolean) }),
      ),
    }),
  ),
});

const decodeReply = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      _tag: Schema.Literal("Exit"),
      requestId: Schema.String,
      exit: Schema.Union([
        Schema.Struct({ _tag: Schema.Literal("Success"), value: Schema.Unknown }),
        Schema.Struct({
          _tag: Schema.Literal("Failure"),
          cause: Schema.Array(
            Schema.Struct({ error: Schema.optionalKey(Schema.Struct({ message: Schema.String })) }),
          ),
        }),
      ]),
    }),
  ),
);

export function fromT3Schedule(schedule: unknown): Timing | string {
  const fixedTime = decodeFixedTime(schedule);

  if (Option.isSome(fixedTime)) {
    const [hour = 0, minute = 0] = fixedTime.value.timeOfDay.split(":").map(Number);
    const weekdays = fixedTime.value.weekdays;
    return { minute, hour, weekdays: weekdays?.length ? normalizeWeekdays(weekdays) : null };
  }

  const type = Option.match(decodeTrigger(schedule), {
    onNone: () => "unknown",
    onSome: (trigger) => trigger.type ?? "unknown",
  });

  // T3 counts an interval from when the previous run finished, so it has no stable time of day.
  return type === "interval"
    ? "interval schedules drift from run to run; give the task a fixed time in T3 to manage it"
    : `${type} triggers have no cron form`;
}

const pad = (value: number) => String(value).padStart(2, "0");

export function toT3Schedule({ minute, hour, weekdays }: Timing) {
  return {
    type: "fixed_time" as const,
    timeOfDay: `${pad(hour)}:${pad(minute)}`,
    ...(weekdays === null ? {} : { weekdays }),
  };
}

const OUTCOMES: Record<string, "ok" | "failed"> = { succeeded: "ok", failed: "failed" };

/** T3 records when a task last ran and how it went; a run still going has no outcome yet. */
export const fromT3LastRun = (task: Pick<Task, "lastRunAt" | "lastRunStatus">) =>
  task.lastRunAt
    ? { at: new Date(task.lastRunAt), outcome: OUTCOMES[task.lastRunStatus ?? ""] }
    : undefined;

const notInstalled = () =>
  `T3 Code is not installed here: no t3 on PATH, in ${t3Home()}/bin, or in a T3 service install. Get it at https://t3.codes`;

/** PATH first, then the desktop app's launcher, then the background service's runtime. */
const findT3 = Effect.gen(function* () {
  const onPath = yield* findOnPath("t3");

  if (onPath) {
    return onPath;
  }

  const launcher = join(t3Home(), "bin/t3");

  if (yield* exists(launcher)) {
    return launcher;
  }

  const service = yield* readJson(
    join(t3Home(), "runtime/service-state.json"),
    Schema.Struct({ activeVersion: Schema.String }),
  ).pipe(Effect.option);

  if (Option.isNone(service)) {
    return undefined;
  }

  const runtime = join(t3Home(), "runtime/versions", service.value.activeVersion, "t3");
  return (yield* exists(runtime)) ? runtime : undefined;
});

const t3Command = findT3.pipe(
  Effect.flatMap((t3) => (t3 ? Effect.succeed(t3) : fail(notInstalled()))),
);

const issueToken = Effect.gen(function* () {
  const stdout = yield* exec(yield* t3Command, [
    "auth",
    "session",
    "issue",
    "--base-dir",
    t3Home(),
    "--scope",
    "orchestration:read",
    "--scope",
    "orchestration:operate",
    "--ttl",
    "5m",
    "--label",
    "agent-schedules",
    "--json",
  ]);
  const { token } = yield* decode(
    Schema.Struct({ token: Schema.NonEmptyString }),
    yield* parseJson(stdout, "t3 auth session issue"),
    "t3 auth session issue",
  );
  return token;
});

const serverOrigin = Effect.gen(function* () {
  let origin = process.env.T3_URL;

  if (!origin) {
    const runtime = yield* readJson(
      join(t3Home(), "userdata/server-runtime.json"),
      Schema.Struct({
        origin: Schema.String.check(Schema.makeFilter((origin) => URL.canParse(origin))),
      }),
    ).pipe(Effect.option);
    origin = Option.isSome(runtime)
      ? runtime.value.origin
      : yield* fail(`No T3 server has run from ${t3Home()}; open T3 Code first`);
  }

  if (!URL.canParse(origin)) {
    return yield* fail("T3 server origin must be a valid HTTP or HTTPS URL");
  }

  const url = new URL(origin);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    return yield* fail(
      "T3 server origin must use HTTPS unless it is localhost, 127.0.0.1, or [::1]",
    );
  }

  return url.origin;
});

const request = (url: URL, tag: string, payload: unknown) =>
  Effect.callback<unknown, HarnessError>((resume) => {
    const socket = new WebSocket(url);
    const id = crypto.randomUUID();
    socket.addEventListener("open", () =>
      socket.send(JSON.stringify({ _tag: "Request", id, tag, payload, headers: [] })),
    );
    socket.addEventListener("error", () => {
      resume(fail(`T3 ${tag}: connection failed`));
      socket.close();
    });
    socket.addEventListener("close", () => resume(fail(`T3 ${tag}: closed without a reply`)));
    socket.addEventListener("message", (event) => {
      const reply = decodeReply(String(event.data));

      if (Option.isNone(reply) || reply.value.requestId !== id) {
        return;
      }

      const { exit } = reply.value;
      resume(
        "value" in exit
          ? Effect.succeed(exit.value)
          : fail(`T3 ${tag}: ${exit.cause[0]?.error?.message ?? "request failed"}`),
      );
      socket.close();
    });
    return Effect.sync(() => socket.close());
  });

const connect = Effect.gen(function* () {
  const origin = yield* serverOrigin;
  const token = process.env.T3_TOKEN ?? (yield* issueToken);
  const headers = {
    authorization: `Bearer ${token}`,
    "x-t3-orchestration-protocol": PROTOCOL_VERSION,
  };

  const rpc = (tag: string, payload: unknown) =>
    Effect.gen(function* () {
      const body = yield* attempt("T3 WebSocket ticket", async (signal) => {
        const response = await fetch(new URL("/api/auth/websocket-ticket", origin), {
          method: "POST",
          headers,
          signal,
        });

        if (!response.ok) {
          throw new Error(`request failed (${response.status})`);
        }

        return response.json();
      });

      const { ticket } = yield* decode(
        Schema.Struct({ ticket: Schema.String }),
        body,
        "T3 WebSocket ticket",
      );
      const url = new URL("/ws", origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.search = new URLSearchParams({
        wsTicket: ticket,
        orchestrationProtocol: PROTOCOL_VERSION,
      }).toString();
      return yield* request(url, tag, payload);
    }).pipe(
      Effect.timeoutOrElse({
        duration: "30 seconds",
        orElse: () => fail(`T3 ${tag}: request timed out after 30 seconds`),
      }),
    );

  const projects = Effect.gen(function* () {
    const body = yield* attempt("T3 shell snapshot", async (signal) => {
      const response = await fetch(new URL("/api/orchestration/shell", origin), {
        headers,
        signal,
      });

      if (!response.ok) {
        throw new Error(`request failed (${response.status})`);
      }

      return response.json();
    });

    const shell = yield* decode(
      Schema.Struct({ projects: Schema.Array(projectSchema) }),
      body,
      "T3 shell snapshot",
    );
    return shell.projects;
  }).pipe(
    Effect.timeoutOrElse({
      duration: "30 seconds",
      orElse: () => fail("T3 shell snapshot: request timed out after 30 seconds"),
    }),
  );

  const models = rpc("server.getConfig", {}).pipe(
    Effect.flatMap((config) => decode(configSchema, config, "T3 server config")),
    Effect.map(({ providers }) =>
      providers
        .filter((provider) => provider.enabled && provider.status === "ready")
        .flatMap((provider) =>
          provider.models
            .filter((model) => !model.isLegacy)
            .map((model) => `${provider.instanceId}/${model.slug}`),
        ),
    ),
  );

  return { rpc, projects, models };
});

const modelId = (selection: ModelSelection) => `${selection.instanceId}/${selection.model}`;

const modelSelection = (id: string, available: ReadonlyArray<string>) => {
  const [instanceId = "", ...rest] = id.split("/");
  return !available.includes(id) || rest.length === 0
    ? fail(`T3 has no model ${id}; choose one of: ${available.join(", ")}`)
    : Effect.succeed<ModelSelection>({ instanceId, model: rest.join("/"), options: [] });
};

const make = Effect.gen(function* () {
  const { cwd, model: requested } = yield* Workspace;
  const services = yield* Effect.context<Platform>();
  const { rpc, projects, models } = yield* connect;
  const findProject = projects.pipe(
    Effect.map((all) => all.find((candidate) => candidate.workspaceRoot === cwd)),
  );
  let project: Project | undefined = yield* findProject;
  const chosen =
    requested === undefined ? undefined : yield* modelSelection(requested, yield* models);
  const model = () => chosen ?? project?.defaultModelSelection ?? undefined;

  let tasks: ReadonlyArray<Task> | undefined;
  const loadTasks = Effect.gen(function* () {
    if (!project) {
      tasks = [];
      return tasks;
    }

    const { id } = project;
    const { tasks: all } = yield* decode(
      Schema.Struct({ tasks: Schema.Array(taskSchema) }),
      yield* rpc("scheduledTasks.list", {}),
      "T3 scheduled tasks",
    );
    tasks = all.filter((task) => task.projectId === id);
    return tasks;
  });

  const missingModel = models.pipe(
    Effect.map(
      ([example = "<instance>/<model>"]) =>
        `no model for new T3 tasks: pass --model, for example --model ${example}, or set a default model on the T3 project (run agent-schedules doctor t3 for the list)`,
    ),
  );

  const toLive = (task: Task): LiveSchedule => {
    const timing = fromT3Schedule(task.schedule);
    const status = task.enabled ? "active" : "paused";
    const lastRun = fromT3LastRun(task);
    const model = Option.map(
      decodeModelSelection(task.modelSelection),
      (selection) => `${selection.instanceId}/${selection.model}`,
    ).pipe(Option.getOrUndefined);
    return typeof timing === "string"
      ? { name: task.title, status, lastRun, model, unsupported: timing }
      : {
          name: task.title,
          status,
          lastRun,
          model,
          schedule: { name: task.title, timing, prompt: task.prompt },
        };
  };

  const addProject: SetupStep = {
    description: `T3 project for ${cwd}`,
    run: Effect.gen(function* () {
      yield* exec(yield* t3Command, ["project", "add", "--base-dir", t3Home(), cwd]);
      project = yield* findProject;

      if (!project) {
        return yield* fail(`t3 project add did not register ${cwd}`);
      }
    }).pipe(Effect.provideContext(services)),
  };

  const save = Effect.fn(function* ({ name, timing, prompt }: Schedule) {
    if (!project) {
      return yield* fail(`No T3 project for ${cwd}`);
    }

    const existing = (tasks ?? (yield* loadTasks)).find((task) => task.title === name);
    const definition = {
      title: name,
      prompt,
      schedule: toT3Schedule(timing),
      projectId: project.id,
    };

    if (existing) {
      const {
        id,
        enabled,
        createdBy,
        creationSource,
        threadId,
        workspaceStrategy,
        modelSelection: selection,
        runtimeMode,
        interactionMode,
      } = existing;
      yield* rpc("scheduledTasks.upsert", {
        ...definition,
        id,
        enabled,
        requireExisting: true,
        createdBy,
        creationSource,
        threadId,
        workspaceStrategy,
        modelSelection: chosen ?? selection,
        runtimeMode,
        interactionMode,
      });
      return undefined;
    }

    const selection = model();

    if (!selection) {
      return yield* fail(yield* missingModel);
    }

    // Unattended runs cannot answer approval prompts.
    yield* rpc("scheduledTasks.upsert", {
      ...definition,
      enabled: true,
      threadId: null,
      workspaceStrategy: { type: "root" },
      modelSelection: selection,
      runtimeMode: "full-access",
      interactionMode: "default",
    });
    return undefined;
  });

  return Harness.of({
    setup: project ? [] : [addProject],
    list: loadTasks.pipe(Effect.map((all) => all.map(toLive))),
    check: (_schedule, existing) =>
      existing || model() !== undefined ? Effect.succeed(undefined) : missingModel,
    save,
  });
});

const doctor = Effect.gen(function* () {
  const { cwd } = yield* Workspace;
  const t3 = yield* findT3;

  if (!t3) {
    return [`not ready: ${notInstalled()}`];
  }

  const lines = [`t3 command: ${t3}`];
  const origin = yield* serverOrigin.pipe(Effect.result);

  if (Result.isFailure(origin)) {
    return [...lines, `server: ${origin.failure.message}`];
  }

  const responding = yield* attempt("T3 server", () =>
    fetch(origin.success, { signal: AbortSignal.timeout(2_000) }),
  ).pipe(
    Effect.map(() => true),
    Effect.orElseSucceed(() => false),
  );

  if (!responding) {
    return [...lines, `server: not responding at ${origin.success}; open T3 Code`];
  }

  const connection = yield* connect.pipe(Effect.result);

  if (Result.isFailure(connection)) {
    return [
      ...lines,
      `server: responding at ${origin.success}`,
      `login: ${connection.failure.message}`,
    ];
  }

  const [project, available] = yield* Effect.all(
    [
      connection.success.projects.pipe(
        Effect.map((all) => all.find((candidate) => candidate.workspaceRoot === cwd)),
      ),
      connection.success.models,
    ],
    { concurrency: 2 },
  );
  const model = project?.defaultModelSelection;
  return [
    ...lines,
    `server: responding at ${origin.success}`,
    "login: ok",
    project
      ? `project: ${project.title}`
      : `project: none for ${cwd} yet; push creates it with t3 project add`,
    model
      ? `model: ${modelId(model)} (project default), override with --model`
      : "model: no project default; push new tasks with --model",
    `models: ${available.join(", ")}`,
  ];
});

export const t3: HarnessDefinition = { layer: Layer.effect(Harness, make), doctor };
