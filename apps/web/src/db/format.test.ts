import { expect, it } from "bun:test";
import { formatWhen } from "./format";

it.each([
  ["7 9 * * 1-5", "Weekdays 09:07"],
  ["0 18 * * 5", "Fridays 18:00"],
  ["0 9 * * *", "Daily 09:00"],
  ["0 9 * * 7", "Sundays 09:00"],
  ["0 9 * * 0-7", "Daily 09:00"],
])("formats %s as %s", (cron, expected) => {
  expect(formatWhen(cron)).toBe(expected);
});

it.each(["60 9 * * *", "0 24 * * *", "*/5 9 * * *", "0 9 * * 8"])(
  "rejects unsupported timing %s",
  (cron) => {
    expect(() => formatWhen(cron)).toThrow();
  },
);
