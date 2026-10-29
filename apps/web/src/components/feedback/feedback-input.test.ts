import { expect, it } from "bun:test";
import { REPOSITORY_SEGMENT, SCHEDULE_SLUG } from "@/db/format";
import { FEEDBACK_INPUT } from "./feedback-input";
import { skillPath } from "@/lib/site";

it("accepts reports and feedback for the longest valid schedule path", () => {
  const owner = "a".repeat(REPOSITORY_SEGMENT.maxLength ?? 0);
  const repo = "b".repeat(REPOSITORY_SEGMENT.maxLength ?? 0);
  const name = "c".repeat(SCHEDULE_SLUG.maxLength ?? 0);
  expect(REPOSITORY_SEGMENT.safeParse(owner).success).toBe(true);
  expect(REPOSITORY_SEGMENT.safeParse(repo).success).toBe(true);
  expect(SCHEDULE_SLUG.safeParse(name).success).toBe(true);
  const page = skillPath({ owner, repo, slug: name });
  for (const input of [
    { kind: "report", reason: "broken", details: "" },
    { kind: "feedback", details: "Some feedback" },
  ]) {
    expect(FEEDBACK_INPUT.safeParse({ ...input, page }).success).toBe(true);
    expect(FEEDBACK_INPUT.safeParse({ ...input, page: `${page}a` }).success).toBe(false);
  }
});
