import type { PgliteDatabase } from "drizzle-orm/pglite";
import { SAMPLE_SCHEDULES } from "./samples";
import * as schema from "./schema";

const INSTALLS = [
  { name: "morning-brief", total: 1200, recent: 90 },
  { name: "review-nudge", total: 720, recent: 150 },
  { name: "branch-hygiene", total: 460, recent: 45 },
  { name: "weekly-summary", total: 310, recent: 110 },
  { name: "dependency-watch", total: 180, recent: 65 },
  { name: "onboarding-tour", total: 40, recent: 30 },
  { name: "ci-flake-report", total: 540, recent: 120 },
  { name: "release-notes-draft", total: 390, recent: 70 },
  { name: "docs-drift", total: 220, recent: 85 },
  { name: "todo-triage", total: 95, recent: 25 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function sampleAgeDays(index: number, recent: number) {
  if (index < recent) {
    return (index % 7) + 0.5;
  }

  return 7.5 + Math.floor(((index * 0.618_034) % 1) * 53);
}

export async function seedSamples(db: PgliteDatabase<typeof schema>) {
  for (const { name, total, recent } of INSTALLS) {
    const sample = SAMPLE_SCHEDULES.find((candidate) => candidate.name === name);

    if (!sample) {
      throw new Error(`No sample named ${name}`);
    }

    const [schedule] = await db
      .insert(schema.schedules)
      .values({ owner: "jln13x", repo: "agent-schedules", githubId: 1, ...sample })
      .returning();

    if (!schedule) {
      throw new Error(`Failed to seed ${name}`);
    }

    await db.insert(schema.installs).values(
      Array.from({ length: total }, (_, index) => ({
        scheduleId: schedule.id,
        createdAt: new Date(Date.now() - sampleAgeDays(index, recent) * DAY_MS),
      })),
    );
  }
}
