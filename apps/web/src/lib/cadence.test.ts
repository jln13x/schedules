import { expect, it } from "bun:test";
import { formatWhen } from "@/db/format";
import { CADENCES, type Cadence, suggestedSchedule, TIMES, type TimeOfDay } from "./cadence";

it("gives every cadence and time a cron the schedule format accepts", () => {
  for (const cadence of Object.keys(CADENCES) as Cadence[]) {
    for (const time of Object.keys(TIMES) as TimeOfDay[]) {
      expect(() => formatWhen(suggestedSchedule(cadence, time).cron)).not.toThrow();
    }
  }
});

it("puts a weekly wrap-up on Friday afternoon and everything else weekly on Monday", () => {
  expect(suggestedSchedule("weekly", "evening")).toMatchObject({
    cron: "0 17 * * 5",
    label: "Every Friday at 17:00",
  });
  expect(suggestedSchedule("weekly", "morning").label).toBe("Every Monday at 08:00");
  expect(suggestedSchedule("weekdays", "midday")).toMatchObject({
    cron: "0 12 * * 1-5",
    weekdays: [1, 2, 3, 4, 5],
  });
  expect(suggestedSchedule("daily", "morning")).toMatchObject({
    cron: "0 8 * * *",
    weekdays: null,
  });
});
