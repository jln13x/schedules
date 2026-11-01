import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import type { LiveSchedule } from "./harness.ts";
import { type Registration, scheduleHash } from "./registrations.ts";
import type { Schedule } from "./schedule.ts";
import { planPull, planPush } from "./sync.ts";

const DIR = "/repo/.agents/schedules";
const timing = { minute: 0, hour: 8, weekdays: [1, 2, 3, 4, 5] };
const brief: Schedule = { name: "Morning brief", timing, prompt: "Read my inbox." };
const file = (schedule: Schedule, name = "morning-brief.md") => ({
  path: `${DIR}/${name}`,
  schedule,
});
const task = (schedule: Schedule, id = "task-1", extra: Partial<LiveSchedule> = {}) =>
  ({ id, name: schedule.name, status: "active", schedule, ...extra }) as LiveSchedule;
const registration = (pushed: Schedule, extra: Partial<Registration> = {}): Registration => ({
  harness: "t3",
  nativeId: "task-1",
  workspace: "/repo",
  // Pushed from another checkout of the same repository, which is the same file.
  source: "/worktrees/feature/.agents/schedules/morning-brief.md",
  name: pushed.name,
  host: "laptop",
  pushed: scheduleHash(pushed),
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...extra,
});

describe("push", () => {
  test("takes over an unregistered task by name, and binds it when nothing changed", () => {
    const [plan] = planPush({
      harness: "t3",
      files: [file(brief)],
      live: [task(brief)],
      registrations: [],
    });
    expect(plan).toEqual({
      name: "Morning brief",
      action: "unchanged",
      bind: { id: "task-1", source: `${DIR}/morning-brief.md`, schedule: brief },
    });
  });

  test("updates a registered task by id after a rename, in place of another task with the new name", () => {
    const renamed = { ...brief, name: "Inbox brief" };
    const [plan] = planPush({
      harness: "t3",
      files: [file(renamed)],
      live: [task(brief), task(renamed, "other")],
      registrations: [registration(brief)],
    });
    expect(plan).toMatchObject({ action: "update", id: "task-1", schedule: renamed });
  });

  test("recreates a registered task that is gone from the scheduler, and says so", () => {
    const [plan] = planPush({
      harness: "t3",
      files: [file(brief)],
      live: [],
      registrations: [registration(brief)],
    });
    expect(plan).toMatchObject({ action: "recreate", reason: "its t3 task is gone" });
    expect(plan && "id" in plan ? plan.id : undefined).toBeUndefined();
  });

  test("won't overwrite an edit made in the scheduler unless forced", () => {
    const edited = { ...brief, prompt: "Read my inbox and calendar." };
    const changedFile = { ...brief, timing: { ...timing, hour: 9 } };
    const input = {
      harness: "t3",
      files: [file(changedFile)],
      live: [task(edited)],
      registrations: [registration(brief)],
    };
    expect(planPush(input)[0]).toMatchObject({
      action: "conflict",
      reason: expect.stringContaining("changed in t3 since the last push"),
    });
    expect(planPush({ ...input, force: true })[0]).toMatchObject({
      action: "update",
      id: "task-1",
    });
    // Edited in the scheduler only: the file still differs from it, so it's the same conflict.
    expect(planPush({ ...input, files: [file(brief)] })[0]).toMatchObject({ action: "conflict" });
  });

  test("updates when only the file changed since the last push", () => {
    const changedFile = { ...brief, prompt: "Read my inbox, briefly." };
    expect(
      planPush({
        harness: "t3",
        files: [file(changedFile)],
        live: [task(brief)],
        registrations: [registration(brief)],
      })[0],
    ).toMatchObject({ action: "update", id: "task-1" });
  });

  test("leaves a task that another existing file drives alone", () => {
    const [plan] = planPush({
      harness: "t3",
      files: [file(brief, "copy.md")],
      live: [task(brief)],
      registrations: [registration(brief, { source: fileURLToPath(import.meta.url) })],
    });
    expect(plan).toMatchObject({
      action: "conflict",
      reason: expect.stringContaining("pushed from"),
    });
  });

  test("a paused task stays settled, and one cron lost needs a push", () => {
    const paused = task(brief, "task-1", { status: "paused" });
    const lost = task(brief, "task-1", { status: "not scheduled" });
    const input = { harness: "codex", files: [file(brief)], registrations: [] };
    expect(planPush({ ...input, live: [paused] })[0]?.action).toBe("unchanged");
    expect(planPush({ ...input, live: [lost] })[0]?.action).toBe("update");
  });
});

describe("pull", () => {
  test("writes a task renamed in the scheduler to the file bound to it", () => {
    const renamed = { ...brief, name: "Inbox brief", skill: undefined };
    const [plan] = planPull({
      harness: "t3",
      files: [file({ ...brief, skill: "inbox" })],
      live: [task(renamed)],
      registrations: [registration(brief)],
    });
    expect(plan).toMatchObject({
      action: "update",
      id: "task-1",
      source: `${DIR}/morning-brief.md`,
      bind: true,
      schedule: { name: "Inbox brief", skill: "inbox" },
    });
  });

  test("adopt binds unregistered tasks, and plain pull doesn't", () => {
    const input = { harness: "t3", files: [], live: [task(brief)], registrations: [] };
    expect(planPull(input)[0]).toMatchObject({ action: "create", bind: false });
    expect(planPull({ ...input, adopt: true })[0]).toMatchObject({ action: "create", bind: true });
    expect(planPull({ ...input, files: [file(brief)], adopt: true })[0]).toMatchObject({
      action: "unchanged",
      bind: { id: "task-1" },
    });
  });

  test("reports a registered task the scheduler lost, and skips triggers a file can't hold", () => {
    const interval = {
      id: "task-2",
      name: "Poll",
      status: "active",
      unsupported: "interval schedules drift",
    } as const;
    expect(
      planPull({
        harness: "t3",
        files: [file(brief)],
        live: [interval],
        registrations: [registration(brief)],
      }),
    ).toEqual([
      { name: "Poll", action: "skip", reason: "interval schedules drift" },
      {
        name: "Morning brief",
        action: "skip",
        reason: "missing from t3; push recreates it, remove forgets it",
      },
    ]);
  });
});
