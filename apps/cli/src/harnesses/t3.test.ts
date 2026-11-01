import { expect, spyOn, test } from "bun:test";
import { NodeServices } from "@effect/platform-node";
import { Effect, Fiber, Result } from "effect";
import { TestClock } from "effect/testing";
import { fromT3LastRun, fromT3Schedule, t3, toT3Schedule } from "./t3.ts";
import { Harness, HarnessError, Workspace, connect, run } from "../harness.ts";

test("T3 schedules convert both ways", () => {
  const timing = { minute: 5, hour: 7, weekdays: [1, 3] };
  expect(toT3Schedule(timing)).toEqual({
    type: "fixed_time",
    timeOfDay: "07:05",
    weekdays: [1, 3],
  });
  expect(fromT3Schedule(toT3Schedule(timing))).toEqual(timing);
  expect(fromT3Schedule({ type: "fixed_time", timeOfDay: "9:30" })).toEqual({
    minute: 30,
    hour: 9,
    weekdays: null,
  });
  expect(typeof fromT3Schedule({ type: "interval", everyMs: 604_800_000 })).toBe("string");
  expect(typeof fromT3Schedule({ type: "webhook" })).toBe("string");
});

for (const stage of [
  "shell headers",
  "shell body",
  "ticket headers",
  "ticket body",
  "socket",
] as const) {
  test(`T3 times out waiting for ${stage}`, async () => {
    const saved = { url: process.env.T3_URL, token: process.env.T3_TOKEN };
    process.env.T3_URL = "http://localhost:12345";
    process.env.T3_TOKEN = "test-token";
    let signal: AbortSignal | null | undefined;
    let closed = false;
    const { promise: waiting, resolve: ready } = Promise.withResolvers<void>();
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const shell = String(input).endsWith("/shell");
      const endpoint = shell ? "shell" : "ticket";

      if (stage === `${endpoint} headers`) {
        signal = init?.signal;
        ready();
        return new Promise<Response>(() => {});
      }

      if (stage === `${endpoint} body`) {
        signal = init?.signal;
        return new Response(new ReadableStream({ start: () => ready() }));
      }

      return Response.json(
        shell
          ? {
              projects: [
                {
                  id: "project",
                  title: "Repo",
                  workspaceRoot: "/repo",
                  defaultModelSelection: null,
                },
              ],
            }
          : { ticket: "test-ticket" },
      );
    });
    const savedSocket = globalThis.WebSocket;
    globalThis.WebSocket = class extends EventTarget {
      constructor() {
        super();
        ready();
      }
      close() {
        closed = true;
        this.dispatchEvent(new Event("close"));
      }
    } as unknown as typeof WebSocket;

    try {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const operation = Effect.gen(function* () {
            const adapter = yield* Harness;
            return yield* adapter.list;
          }).pipe(
            Effect.provide(t3.layer),
            Effect.provideService(Workspace, { cwd: "/repo" }),
            Effect.provide(NodeServices.layer),
            Effect.result,
          );
          const fiber = yield* Effect.forkChild(operation);
          yield* Effect.promise(() => waiting);
          yield* TestClock.adjust("30 seconds");
          return yield* Fiber.join(fiber);
        }).pipe(Effect.provide(TestClock.layer())),
      );
      expect(Result.isFailure(result)).toBe(true);

      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(HarnessError);
        expect(result.failure.message).toBe(
          `T3 ${stage.startsWith("shell") ? "shell snapshot" : "scheduledTasks.list"}: request timed out after 30 seconds`,
        );
      }

      if (stage === "socket") {
        expect(closed).toBe(true);
      } else {
        expect(signal?.aborted).toBe(true);
      }
    } finally {
      fetchMock.mockRestore();
      globalThis.WebSocket = savedSocket;
      process.env.T3_URL = saved.url;
      process.env.T3_TOKEN = saved.token;
    }
  });
}

test("T3 keeps the reply when socket cleanup fires a close event", async () => {
  const saved = {
    url: process.env.T3_URL,
    token: process.env.T3_TOKEN,
    socket: globalThis.WebSocket,
  };
  process.env.T3_URL = "http://localhost:12345";
  process.env.T3_TOKEN = "test-token";
  let closed = false;
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async (input) =>
    Response.json(
      String(input).endsWith("/shell")
        ? {
            projects: [
              { id: "project", title: "Repo", workspaceRoot: "/repo", defaultModelSelection: null },
            ],
          }
        : { ticket: "test-ticket" },
    ),
  );
  globalThis.WebSocket = class extends EventTarget {
    constructor() {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(message: string) {
      const { id } = JSON.parse(message);
      this.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            _tag: "Exit",
            requestId: id,
            exit: { _tag: "Success", value: { tasks: [] } },
          }),
        }),
      );
    }
    close() {
      closed = true;
      this.dispatchEvent(new Event("close"));
    }
  } as unknown as typeof WebSocket;

  try {
    const adapter = await connect(t3, { cwd: "/repo" });
    expect(await run(adapter.list)).toEqual([]);
    expect(closed).toBe(true);
    // Refused, not moved to a weekly time, in previews as well as saves.
    const monthly = {
      name: "Monthly",
      timing: { minute: 0, hour: 8, weekdays: null, monthDay: 1 },
      prompt: "Do it.",
    };
    expect(await run(adapter.check(monthly, true))).toContain("no monthly schedule");
    expect(run(adapter.save(monthly))).rejects.toThrow("no monthly schedule");
  } finally {
    fetchMock.mockRestore();
    globalThis.WebSocket = saved.socket;
    process.env.T3_URL = saved.url;
    process.env.T3_TOKEN = saved.token;
  }
});

test("T3 last runs carry their outcome", () => {
  const at = "2026-10-28T06:49:02.073Z";
  expect(fromT3LastRun({ lastRunAt: at, lastRunStatus: "succeeded" })).toEqual({
    at: new Date(at),
    outcome: "ok",
  });
  expect(fromT3LastRun({ lastRunAt: at, lastRunStatus: "failed" })?.outcome).toBe("failed");
  expect(fromT3LastRun({ lastRunAt: at, lastRunStatus: "running" })?.outcome).toBeUndefined();
  expect(fromT3LastRun({ lastRunAt: null, lastRunStatus: "never" })).toBeUndefined();
  // Older T3 versions don't report runs at all.
  expect(fromT3LastRun({})).toBeUndefined();
});

const t3Task = (id: string, projectId: string, extra: object = {}) => ({
  id,
  title: id,
  prompt: `Run ${id}.`,
  enabled: true,
  schedule: { type: "fixed_time", timeOfDay: "08:00", weekdays: [1] },
  projectId,
  createdBy: null,
  creationSource: null,
  threadId: null,
  workspaceStrategy: { type: "worktree" },
  modelSelection: { instanceId: "codex", model: "gpt-6" },
  runtimeMode: "full-access",
  interactionMode: "default",
  ...extra,
});

test("T3 lists every project's tasks, controls them by id, and saves by id", async () => {
  const saved = {
    url: process.env.T3_URL,
    token: process.env.T3_TOKEN,
    socket: globalThis.WebSocket,
  };
  process.env.T3_URL = "http://localhost:12345";
  process.env.T3_TOKEN = "test-token";
  const requests: Array<{ tag: string; payload: Record<string, unknown> }> = [];
  const replies: Record<string, unknown> = {
    "scheduledTasks.list": {
      tasks: [
        t3Task("brief", "project"),
        t3Task("hook", "other", { schedule: { type: "webhook" }, threadId: "thread-1" }),
      ],
    },
    "scheduledTasks.upsert": { task: { id: "created" } },
    "server.getConfig": {
      providers: [
        { instanceId: "codex", enabled: true, status: "ready", models: [{ slug: "gpt-6" }] },
      ],
    },
  };
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async (input) =>
    Response.json(
      String(input).endsWith("/shell")
        ? {
            projects: [
              { id: "project", title: "Repo", workspaceRoot: "/repo", defaultModelSelection: null },
              { id: "other", title: "Other", workspaceRoot: "/other", defaultModelSelection: null },
            ],
          }
        : { ticket: "test-ticket" },
    ),
  );
  globalThis.WebSocket = class extends EventTarget {
    constructor() {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(message: string) {
      const { id, tag, payload } = JSON.parse(message);
      requests.push({ tag, payload });
      this.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            _tag: "Exit",
            requestId: id,
            exit: { _tag: "Success", value: replies[tag] ?? {} },
          }),
        }),
      );
    }
    close() {}
  } as unknown as typeof WebSocket;

  try {
    const all = await run(t3.inventory);
    expect(all.map((live) => [live.id, live.workspace])).toEqual([
      ["brief", "/repo"],
      ["hook", "/other"],
    ]);
    expect(all[1]).toMatchObject({
      unsupported: "webhook triggers have no cron form",
      prompt: "Run hook.",
      settings: { trigger: "webhook", thread: "thread-1", workspaceStrategy: "worktree" },
    });

    await run(t3.setEnabled?.("brief", false) ?? Effect.succeed(undefined));
    expect(await run(t3.runNow?.("brief") ?? Effect.succeed(undefined))).toBe("started in T3");
    await run(t3.remove?.("hook") ?? Effect.succeed(undefined));
    expect(requests.filter(({ tag }) => tag !== "scheduledTasks.list")).toEqual([
      { tag: "scheduledTasks.setEnabled", payload: { id: "brief", enabled: false } },
      { tag: "scheduledTasks.runNow", payload: { id: "brief" } },
      { tag: "scheduledTasks.delete", payload: { id: "hook" } },
    ]);

    // An update by id keeps the task's own settings; a new task reports the id T3 gave it.
    requests.length = 0;
    const adapter = await connect(t3, { cwd: "/repo", model: "codex/gpt-6" });
    const schedule = {
      name: "Renamed",
      timing: { minute: 0, hour: 9, weekdays: [1] },
      prompt: "Run it.",
    };
    expect(await run(adapter.save(schedule, "brief"))).toEqual({ id: "brief" });
    expect(requests.at(-1)?.payload).toMatchObject({
      id: "brief",
      title: "Renamed",
      enabled: true,
      workspaceStrategy: { type: "worktree" },
      requireExisting: true,
    });
    expect(run(adapter.save(schedule, "gone"))).rejects.toThrow("no task gone");
    expect(await run(adapter.save({ ...schedule, name: "New" }))).toEqual({ id: "created" });
  } finally {
    fetchMock.mockRestore();
    globalThis.WebSocket = saved.socket;
    process.env.T3_URL = saved.url;
    process.env.T3_TOKEN = saved.token;
  }
});
