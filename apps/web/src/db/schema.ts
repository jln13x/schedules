import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgSchema,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** @public Exported so drizzle-kit creates the schema before its tables. */
export const SCHEDULES_SCHEMA = pgSchema("schedules");

/**
 * Every skill the directory has seen, listed or not. Remembering the rejected ones, with the content
 * hash they were judged on, is what keeps a daily import from classifying unchanged skills again.
 */
export const skills = SCHEDULES_SCHEMA.table(
  "skills",
  {
    /** skills.sh's id: owner/repo/skill for GitHub skills. */
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    installs: integer("installs").notNull().default(0),
    /** skills.sh marks forks of another skill; they are never listed. */
    duplicate: boolean("duplicate").notNull().default(false),
    hash: text("hash"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** The hash Jev's answers below belong to; a different hash means they are stale. */
    classifiedHash: text("classified_hash"),
    model: text("model"),
    recurring: doublePrecision("recurring"),
    usefulness: integer("usefulness"),
    /** Share of "one run serves the team" against "each person runs it"; for you is one minus it. */
    forTeam: doublePrecision("for_team"),
    abuse: doublePrecision("abuse"),
    cadence: text("cadence"),
    /** Worst security audit result on skills.sh, or null before any partner audited it. */
    audit: text("audit"),
    /** Why a skill is kept out of the directory by hand; null means the scores decide. */
    hidden: text("hidden"),
  },
  (table) => [index().on(table.installs), index().on(table.recurring), index().on(table.fetchedAt)],
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
