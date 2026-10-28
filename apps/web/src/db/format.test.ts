import { expect, it } from "bun:test";
import { formatWhen, parseScheduleSource } from "./format";

it.each([
  ["7 9 * * 1-5", "Weekdays 09:07"],
  ["0 18 * * 5", "Fridays 18:00"],
  ["0 9 * * *", "Daily 09:00"],
  ["0 9 * * 7", "Sundays 09:00"],
  ["0 9 * * 0-7", "Daily 09:00"],
])("formats %s as %s", (cron, expected) => {
  expect(formatWhen(cron)).toBe(expected);
});

it.each([
  "60 9 * * *",
  "0 24 * * *",
  "0 9 1 * *",
  "0 9 * 1 *",
  "*/5 9 * * *",
  "0 9 * * 5-1",
  "0 9 * * 8",
])("rejects unsupported timing %s", (cron) => {
  expect(() =>
    parseScheduleSource(`---\nname: Example\nschedule: '${cron}'\n---\nPrompt`),
  ).toThrow();
});

it("reads YAML metadata and preserves the multiline prompt", () => {
  const source = '---\nname: Example\nschedule: "0 9 * * *"\n---\n\nFirst line.\nSecond line.\n';
  expect(parseScheduleSource(source)).toEqual({
    displayName: "Example",
    cron: "0 9 * * *",
    prompt: "First line.\nSecond line.",
  });
});
