import { describe, expect, test } from "vitest";
import type { ShipmentException } from "@/domain/exceptions";
import { buildTimeline } from "@/domain/fold";
import type { LoggedEvent } from "@/domain/log";
import type { Deadline, Shipment } from "@/domain/shipment";
import { nextExpectation } from "@/domain/staleness";
import { at, confirmed, oceanShipment, position, roadShipment } from "@/domain/test-support";
import { DAY, HOUR, instantAt, MINUTE, type Instant } from "@/domain/time";
import { shortAccountName, type Directory } from "../directory";
import { clockOf, overdueReason } from "./case-text";
import { describeFilter } from "./filter-text";
import { days, list, relativeDay, timeLeft } from "./format";
import { datesIn, ungroundedDates } from "./grounding";

describe("dates in a text", () => {
  test("finds a date however it is written", () => {
    expect(datesIn("Delivery on 16 Oct, not on 14 October.")).toEqual(["16 Oct", "14 Oct"]);
    expect(datesIn("We expect it on October 16th.")).toEqual(["16 Oct"]);
    expect(datesIn("Due 17/10/2026 or 18/10/26.")).toEqual(["17 Oct", "18 Oct"]);
    expect(datesIn("Sailing 2026-10-09.")).toEqual(["9 Oct"]);
    expect(datesIn("the 3rd of the month, 1st Nov")).toEqual(["1 Nov"]);
  });

  test("does not take a time of day, a weight or a reference for a date", () => {
    expect(datesIn("Gate-in on 6 Oct 11:12.")).toEqual(["6 Oct"]);
    expect(datesIn("4,180 kg against 4,810 kg, order 48176, voyage 612W")).toEqual([]);
    expect(datesIn("We will confirm today, or tomorrow at 10:00.")).toEqual([]);
    expect(datesIn("Octopus 12 was not a date, and neither is 40/13.")).toEqual([]);
    expect(datesIn("One of the 4 may have been damaged; it may 2 days later.")).toEqual([]);
    expect(datesIn("Delivery on 4 May, or in may 5.")).toEqual(["4 May"]);
  });

  test("two numbers and a slash are a date only with a year: a fraction or an opening time is not one", () => {
    expect(datesIn("3/4 pallets were reloaded; call us 24/7.")).toEqual([]);
    expect(datesIn("Due 16/10, on dock 2/3.")).toEqual([]);
    expect(datesIn("Due 16/10/2026.")).toEqual(["16 Oct"]);
  });

  test("keeps the weekday a date was written with", () => {
    expect(datesIn("Delivery on Wed 8 Oct.")).toEqual(["Wed 8 Oct"]);
    expect(datesIn("On Thursday, 8th October, or Thurs. October 8.")).toEqual(["Thu 8 Oct"]);
    expect(datesIn("It sat 8 Oct in the yard and was wed 9 Oct to a trailer.")).toEqual([
      "8 Oct",
      "9 Oct",
    ]);
  });

  test("names the dates of a text that no fact carries", () => {
    const facts = [{ dates: ["2026-10-16"] }, { dates: ["2026-10-14", "2026-10-09"] }];
    expect(ungroundedDates("Now Fri 16 Oct instead of Wed 14 Oct.", facts)).toEqual([]);
    expect(ungroundedDates("Now Fri 16 Oct, at the latest 18 Oct or 19/10/2026.", facts)).toEqual([
      "18 Oct",
      "19 Oct",
    ]);
    expect(ungroundedDates("No date at all.", [])).toEqual([]);
  });

  test("a weekday that contradicts its date makes the date one the record does not hold", () => {
    const facts = [{ dates: ["2026-10-08"] }];
    expect(ungroundedDates("Delivery stays Thu 8 Oct, Thursday 8 October.", facts)).toEqual([]);
    expect(ungroundedDates("Delivery stays Wed 8 Oct.", facts)).toEqual(["Wed 8 Oct"]);
    expect(ungroundedDates("Delivery on Friday, October 8th.", facts)).toEqual(["Fri 8 Oct"]);
    // A day the record does not hold at all is named as a day, whatever weekday it was given.
    expect(ungroundedDates("Please move it to Sun 18 Oct, or 18 Oct.", facts)).toEqual(["18 Oct"]);
  });
});

describe("wording", () => {
  test("counts of days are spelled out, and plural only when they are", () => {
    expect([0, 1, 2, 10, 11].map(days)).toEqual([
      "zero days",
      "one day",
      "two days",
      "ten days",
      "11 days",
    ]);
  });

  test("time left is rounded down: a desk never reads more time than it has", () => {
    expect(timeLeft(4 * HOUR)).toBe("4 h");
    expect(timeLeft(4 * HOUR - MINUTE)).toBe("3 h");
    expect(timeLeft(59 * MINUTE)).toBe("59 min");
    expect(timeLeft(30_000)).toBe("1 min");
    expect(timeLeft(2 * DAY - MINUTE)).toBe("47 h");
    expect(timeLeft(2 * DAY)).toBe("2 days");
  });

  test("lists and relative days read as a person would say them", () => {
    expect(list([])).toBe("");
    expect(list(["a"])).toBe("a");
    expect(list(["a", "b"])).toBe("a and b");
    expect(list(["a", "b", "c"])).toBe("a, b and c");
    expect(relativeDay("2026-10-07", "2026-10-07")).toBe("today");
    expect(relativeDay("2026-10-08", "2026-10-07")).toBe("tomorrow");
    expect(relativeDay("2026-10-06", "2026-10-07")).toBe("yesterday");
    expect(relativeDay("2026-10-09", "2026-10-07")).toBe("Fri 9 Oct");
  });

  test("an account is called by its name without the legal form", () => {
    expect(shortAccountName("Aquabajío Ingeniería, S.A. de C.V.")).toBe("Aquabajío Ingeniería");
    expect(shortAccountName("Vauclair Hydraulique SAS")).toBe("Vauclair Hydraulique");
    expect(shortAccountName("Ibón Deutschland GmbH")).toBe("Ibón Deutschland");
    expect(shortAccountName("Riegos Thader, S.L.")).toBe("Riegos Thader");
    expect(shortAccountName("GmbH")).toBe("GmbH");
  });
});

describe("why a shipment that owes an update gets no estimate", () => {
  const directory: Directory = {
    manufacturer: "Ibón",
    shipments: [],
    operators: [{ id: "EVS", name: "Eisvogel Spedition", kind: "road_carrier" }],
    sites: [],
    accounts: [],
    actors: [],
  };
  const owed = (shipment: Shipment, events: LoggedEvent[], now: Instant) => {
    const expectation = nextExpectation(buildTimeline(shipment, events));
    return expectation && now > expectation.by ? overdueReason(directory, expectation, now) : null;
  };

  test("a truck with telematics that has gone silent: the reason names who is silent, and for how long", () => {
    const shipment = roadShipment({ telematics: true });
    const events = [
      confirmed(shipment, "PICKED_UP", at("2026-10-05 15:05")),
      position(shipment, "La Jonquera, ES", at("2026-10-06 13:00")),
    ];
    expect(owed(shipment, events, at("2026-10-06 20:00"))).toBeNull();
    expect(owed(shipment, events, at("2026-10-07 16:00"))).toBe(
      "no position from Eisvogel Spedition for 27 h",
    );
  });

  test("a milestone overdue past its grace: the reason names the report that never came", () => {
    const shipment = roadShipment();
    const events = [
      confirmed(shipment, "PICKED_UP", at("2026-10-05 15:05")),
      confirmed(shipment, "OUT_FOR_DELIVERY", at("2026-10-08 07:00")),
    ];
    expect(owed(shipment, events, at("2026-10-09 10:30"))).toBe(
      "the delivery at Saint-Priest, expected Thu 8 Oct 10:00, has not been reported",
    );
  });
});

function must<Value>(value: Value | undefined): Value {
  if (value === undefined) throw new Error("The fixture has no such deadline");
  return value;
}

describe("the clock of a case", () => {
  const shipment = roadShipment();
  const ocean = oceanShipment();
  const clockOn = (deadline: Deadline): ShipmentException["actBy"] => ({
    at: deadline.at,
    label: deadline.label,
    deadline,
  });
  const held = (actBy: ShipmentException["actBy"]): ShipmentException => ({
    id: `${shipment.id}:carrier_hold`,
    type: "carrier_hold",
    health: "held",
    basis: "declared",
    since: at("2026-10-07 05:10"),
    ...(actBy ? { actBy } : {}),
    evidence: [],
    steps: [],
    state: "needs_action",
  });

  test("is worded from the deadline it carries, not from one looked up by time and label", () => {
    const tomorrow = at("2026-10-08 20:00");
    // A linehaul that leaves every evening: tonight's is on file, the clock is on tomorrow's.
    const departure: Deadline = { ...must(shipment.deadlines[0]), at: tomorrow };
    expect(clockOf(shipment, held(clockOn(departure)), at("2026-10-07 21:00"))).toEqual({
      kind: "next_departure",
      at: tomorrow,
      zone: "Europe/Paris",
      label: "Act within 23 h",
      detail: "Next linehaul leaves the Perpignan hub, Thu 8 Oct 20:00",
    });
  });

  test("is read at the place its deadline protects, or where the shipment starts when it names none", () => {
    const freeTime = must(ocean.deadlines.find((deadline) => deadline.kind === "free_time_end"));
    const now = at("2026-10-13 09:00");
    // 23:59 on Friday in Veracruz is already Saturday morning in Valencia.
    expect(clockOf(ocean, held(clockOn(freeTime)), now)).toMatchObject({
      zone: "America/Mexico_City",
      label: "Free time ends Fri 16 Oct",
    });
    const unplaced: Deadline = { kind: freeTime.kind, at: freeTime.at, label: freeTime.label };
    expect(clockOf(ocean, held(clockOn(unplaced)), now)).toMatchObject({
      zone: "Europe/Madrid",
      label: "Free time ends Sat 17 Oct",
    });
  });

  test("runs from now when it is the customer who has not been told: no deadline is behind it", () => {
    const now = at("2026-10-07 16:00");
    const untold = held({ at: now, label: "Customer not yet told" });
    expect(clockOf(shipment, untold, now)).toEqual({
      kind: "now",
      at: now,
      zone: "Europe/Madrid",
      label: "Now",
      detail: "Customer not yet told",
    });
    expect(clockOf(shipment, held(undefined), now)).toBeNull();
  });
});

describe("filter chips", () => {
  const vocabulary = {
    countries: ["FR" as const],
    accounts: [{ id: "VAU", name: "Vauclair Hydraulique SAS" }],
    sites: [{ id: "BIO", name: "Abadiño plant", aliases: ["Bilbao"] }],
    operators: [{ id: "EVS", name: "Eisvogel Spedition" }],
    vessels: [],
  };
  const now = instantAt("2026-10-07", "16:00", "Europe/Madrid");
  const labels = (filter: Parameters<typeof describeFilter>[0], at = now) =>
    describeFilter(filter, vocabulary, at).map((chip) => chip.label);

  test("one chip per constraint, each with its value resolved", () => {
    expect(
      labels({
        destinationCountry: "FR",
        originSiteId: "BIO",
        accountId: "VAU",
        operatorId: "EVS",
        vessel: "NORAY ALTAIR",
        health: ["delayed", "at_risk"],
        stage: ["at_sea", "in_transit"],
        customsHold: true,
        due: "this_week",
        delivered: false,
        text: "pumps",
      }),
    ).toEqual([
      "Destination: France",
      "Origin: Abadiño plant",
      "Account: Vauclair Hydraulique",
      "Operator: Eisvogel Spedition",
      "Vessel: NORAY ALTAIR",
      "Health: Delayed or At risk",
      "Stage: At sea or In transit",
      "Customs hold",
      "Due: this week, 5–11 Oct",
      "Not delivered",
      'Text: "pumps"',
    ]);
    expect(labels({})).toEqual([]);
  });

  test("a period is resolved from now, also across the end of a month", () => {
    expect(labels({ due: "today" })).toEqual(["Due: today, 7 Oct"]);
    expect(labels({ due: "next_week" })).toEqual(["Due: next week, 12–18 Oct"]);
    const endOfMonth = instantAt("2026-09-30", "10:00", "Europe/Madrid");
    expect(labels({ due: "this_week" }, endOfMonth)).toEqual(["Due: this week, 28 Sep – 4 Oct"]);
  });

  test("an id that is not in the vocabulary is shown as the id", () => {
    expect(labels({ accountId: "AQB", originSiteId: "ZAZ", operatorId: "NRY" })).toEqual([
      "Origin: ZAZ",
      "Account: AQB",
      "Operator: NRY",
    ]);
  });
});
