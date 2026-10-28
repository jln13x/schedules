import {
  bigint,
  bigserial,
  index,
  integer,
  pgSchema,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/** @public Exported so drizzle-kit creates the schema before its tables. */
export const SCHEDULES_SCHEMA = pgSchema("schedules");
export const schedules = SCHEDULES_SCHEMA.table(
  "schedules",
  {
    id: serial("id").primaryKey(),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    // GitHub's repository id survives renames.
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    cron: text("cron").notNull(),
    prompt: text("prompt").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.owner, table.repo, table.name), index().on(table.githubId)],
);

/** Every name a repository has been reached under, so installs and links made under an old one still find it. */
export const repositoryNames = SCHEDULES_SCHEMA.table(
  "repository_names",
  {
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.owner, table.repo] })],
);

export const installs = SCHEDULES_SCHEMA.table(
  "installs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    scheduleId: integer("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.scheduleId, table.createdAt)],
);

export const sponsorDrafts = SCHEDULES_SCHEMA.table("sponsor_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sponsorships = SCHEDULES_SCHEMA.table("sponsorships", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  url: text("url").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  note: text("note"),
});
