import { describe, expect, test } from "vitest";
import {
  addDays,
  addWorkingDays,
  dayInstant,
  dayOf,
  diffDays,
  formatDay,
  formatStamp,
  HOUR,
  instantAt,
  isoWithOffset,
  isPast,
  isWorkingDay,
  localDate,
  localTime,
  MINUTE,
  nextWorkingDay,
  weekOf,
  weekday,
  type Zone,
} from "./time";

const ZONES: Zone[] = ["Europe/Madrid", "Europe/Paris", "Europe/Berlin", "America/Mexico_City"];

describe("local dates and instants", () => {
  test.each(ZONES)("round-trip a wall-clock time in %s", (zone) => {
    for (const [date, time] of [
      ["2026-07-15", "00:00"],
      ["2026-10-07", "16:00"],
      ["2026-10-25", "12:30"],
      ["2026-12-31", "23:59"],
    ] as const) {
      const instant = instantAt(date, time, zone);
      expect(localDate(instant, zone)).toBe(date);
      expect(localTime(instant, zone)).toBe(time);
    }
  });

  test("the demo instant is 16:00 in Madrid, 14:00 UTC and 08:00 in Veracruz", () => {
    const t0 = instantAt("2026-10-07", "16:00", "Europe/Madrid");
    expect(new Date(t0).toISOString()).toBe("2026-10-07T14:00:00.000Z");
    expect(localTime(t0, "America/Mexico_City")).toBe("08:00");
  });

  test("the same instant is a different local day on each side of the Atlantic", () => {
    const lateEvening = instantAt("2026-10-08", "23:30", "America/Mexico_City");
    expect(localDate(lateEvening, "America/Mexico_City")).toBe("2026-10-08");
    expect(localDate(lateEvening, "Europe/Madrid")).toBe("2026-10-09");
  });

  test("25 October 2026 lasts 25 hours in Madrid and 24 in Mexico City", () => {
    const length = (zone: Zone) =>
      instantAt("2026-10-26", "00:00", zone) - instantAt("2026-10-25", "00:00", zone);
    expect(length("Europe/Madrid")).toBe(25 * HOUR);
    expect(length("America/Mexico_City")).toBe(24 * HOUR);
  });

  test("Madrid is seven hours ahead of Veracruz after the change, eight before", () => {
    const gap = (date: string) =>
      instantAt(date, "12:00", "America/Mexico_City") - instantAt(date, "12:00", "Europe/Madrid");
    expect(gap("2026-10-24")).toBe(8 * HOUR);
    expect(gap("2026-10-26")).toBe(7 * HOUR);
  });

  test("on the night the clocks go back, 01:30 is still summer time and 02:30 is its second occurrence", () => {
    expect(instantAt("2026-10-25", "01:30", "Europe/Madrid")).toBe(Date.UTC(2026, 9, 24, 23, 30));
    expect(instantAt("2026-10-25", "02:30", "Europe/Madrid")).toBe(Date.UTC(2026, 9, 25, 1, 30));
  });

  test("rejects what is not a date or a time", () => {
    expect(() => instantAt("2026-02-30", "10:00", "Europe/Madrid")).toThrow(RangeError);
    expect(() => instantAt("07/10/2026", "10:00", "Europe/Madrid")).toThrow(RangeError);
    expect(() => instantAt("2026-10-07", "10h", "Europe/Madrid")).toThrow(RangeError);
  });

  test.each(["24:00", "23:60", "99:99"])(
    "rejects %s, a time of day that does not exist, instead of rolling over into another day",
    (time) => {
      expect(() => instantAt("2026-10-07", time, "Europe/Madrid")).toThrow(RangeError);
    },
  );

  test("writes an instant with the offset of its zone", () => {
    const instant = instantAt("2026-09-22", "08:31", "Europe/Madrid");
    expect(isoWithOffset(instant, "Europe/Madrid")).toBe("2026-09-22T08:31:00+02:00");
    expect(isoWithOffset(instant, "America/Mexico_City")).toBe("2026-09-22T00:31:00-06:00");
    const winter = instantAt("2026-10-26", "08:31", "Europe/Madrid");
    expect(isoWithOffset(winter, "Europe/Berlin")).toBe("2026-10-26T08:31:00+01:00");
  });
});

describe("day-precision values", () => {
  test.each(ZONES)("a day reads as the same calendar date in %s", (zone) => {
    for (const date of ["2026-01-01", "2026-10-14", "2026-10-25", "2026-12-31"]) {
      expect(localDate(dayInstant(date), zone)).toBe(date);
      expect(dayOf(dayInstant(date))).toBe(date);
    }
  });

  test("a day never renders a time of day", () => {
    expect(formatStamp(dayInstant("2026-10-14"), "day", "America/Mexico_City")).toBe("Wed 14 Oct");
    expect(
      formatStamp(instantAt("2026-09-22", "08:25", "Europe/Madrid"), "minute", "Europe/Madrid"),
    ).toBe("Tue 22 Sep 08:25");
  });
});

describe("day arithmetic", () => {
  test("counts days across the daylight-saving change and across months", () => {
    expect(diffDays("2026-10-24", "2026-10-26")).toBe(2);
    expect(diffDays("2026-09-25", "2026-10-09")).toBe(14);
    expect(diffDays("2026-10-15", "2026-10-14")).toBe(-1);
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });

  test("knows the weekdays of the demo calendar", () => {
    expect(weekday("2026-10-07")).toBe(3);
    expect(formatDay("2026-10-07")).toBe("Wed 7 Oct");
    expect(formatDay("2026-09-25")).toBe("Fri 25 Sep");
    expect(formatDay("2026-10-25")).toBe("Sun 25 Oct");
  });

  test("a week runs Monday to Sunday", () => {
    expect(weekOf("2026-10-07")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(weekOf("2026-10-05")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(weekOf("2026-10-11")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(weekOf("2026-10-12")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });

  test("working days are Monday to Friday", () => {
    expect(isWorkingDay("2026-10-09")).toBe(true);
    expect(isWorkingDay("2026-10-10")).toBe(false);
    expect(isWorkingDay("2026-10-11")).toBe(false);
    expect(nextWorkingDay("2026-10-08")).toBe("2026-10-09");
    expect(nextWorkingDay("2026-10-09")).toBe("2026-10-12");
    expect(nextWorkingDay("2026-10-10")).toBe("2026-10-12");
  });

  test("a minute is past the instant after it; a day only once that day is over at the place", () => {
    const noon = instantAt("2026-10-07", "12:00", "Europe/Madrid");
    expect(isPast(noon - MINUTE, "minute", noon, "Europe/Madrid")).toBe(true);
    expect(isPast(noon, "minute", noon, "Europe/Madrid")).toBe(false);

    const wednesday = dayInstant("2026-10-07");
    const lateWednesday = instantAt("2026-10-07", "23:59", "America/Mexico_City");
    const earlyThursday = instantAt("2026-10-08", "00:01", "America/Mexico_City");
    // Stored at noon UTC, a day would look "past" from early afternoon if compared as an instant.
    expect(isPast(wednesday, "day", lateWednesday, "America/Mexico_City")).toBe(false);
    expect(isPast(wednesday, "day", earlyThursday, "America/Mexico_City")).toBe(true);
    // Thursday has started in Madrid while it is still Wednesday in Mexico.
    expect(isPast(wednesday, "day", lateWednesday, "Europe/Madrid")).toBe(true);
  });

  test("adds working days over a weekend", () => {
    expect(addWorkingDays("2026-10-08", 0)).toBe("2026-10-08");
    expect(addWorkingDays("2026-10-08", 2)).toBe("2026-10-12");
    expect(addWorkingDays("2026-10-09", 5)).toBe("2026-10-16");
  });
});
