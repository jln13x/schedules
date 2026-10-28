import { describe, expect, test } from "bun:test";
import { describeTiming, parseSchedule, serializeSchedule, timingFromCron } from "./schedule.ts";

const file = (schedule: string) => `---\nname: Example\nschedule: ${schedule}\n---\n\nDo it.\n`;

describe("schedules", () => {
  test("cron normalizes weekdays and round-trips", () => {
    const schedule = parseSchedule(file('"30 6 * * 5,1-3,7"'), "example.md");
    expect(schedule.timing).toEqual({ minute: 30, hour: 6, weekdays: [0, 1, 2, 3, 5] });
    expect(serializeSchedule(schedule)).toContain("30 6 * * 0-3,5");
    expect(parseSchedule(file('"0 9 * * 0-6"'), "example.md").timing.weekdays).toBeNull();
  });

  test("cron rejects shapes the schedulers cannot express", () => {
    expect(() => parseSchedule(file('"*/5 * * * *"'), "example.md")).toThrow();
    expect(() => parseSchedule(file('"0 9 1 * *"'), "example.md")).toThrow("Day of month");
    expect(() =>
      parseSchedule(file('"0 9 * * *"').replace("Example", '"!!!"'), "example.md"),
    ).toThrow("letter or digit");
    expect(typeof timingFromCron("0 */2 * * *")).toBe("string");
  });

  test("timing reads as words", () => {
    expect(describeTiming({ minute: 7, hour: 9, weekdays: [1, 2, 3, 4, 5] })).toBe(
      "Weekdays 09:07",
    );
    expect(describeTiming({ minute: 0, hour: 17, weekdays: [1, 5] })).toBe(
      "Mondays, Fridays 17:00",
    );
    expect(describeTiming({ minute: 30, hour: 6, weekdays: null })).toBe("Daily 06:30");
  });

  test("a byte order mark or CRLF line endings change nothing", () => {
    const plain = parseSchedule(file("0 9 * * *"), "x.md");
    expect(parseSchedule(`\uFEFF${file("0 9 * * *")}`, "x.md")).toEqual(plain);
    expect(parseSchedule(file("0 9 * * *").replaceAll("\n", "\r\n"), "x.md")).toEqual(plain);
  });

  test("a name stays on one line", () => {
    expect(() =>
      parseSchedule(`---\nname: |\n  Two\n  lines\nschedule: 0 9 * * *\n---\n\nDo it.\n`, "x.md"),
    ).toThrow("single line");
  });
});
