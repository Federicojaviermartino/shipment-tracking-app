import { describe, expect, test } from "vitest";
import type { EtaEstimator } from "@/application/ports/eta-estimator";
import { startEstela } from "@/composition/test-support";
import { estimateBasis, type Estimate } from "@/domain/estimate";
import { buildTimeline } from "@/domain/fold";
import type { LoggedEvent } from "@/domain/log";
import type { DocumentType, Shipment } from "@/domain/shipment";
import { nextExpectation } from "@/domain/staleness";
import {
  at,
  confirmed,
  day,
  estimated,
  hold,
  MEXICO,
  oceanShipment,
  PERPIGNAN,
  roadShipment,
  VALENCIA,
} from "@/domain/test-support";
import { DAY, formatStamp, HOUR, localDate, MINUTE, type Instant } from "@/domain/time";
import { isDelivered } from "@/domain/timeline";
import { SHIPMENTS, T0 } from "@/fixtures";
import { ruleBasedEstimator } from "./rule-based-estimator";

async function estimate(shipment: Shipment, events: LoggedEvent[], now: Instant) {
  return ruleBasedEstimator.estimate({
    shipment,
    timeline: buildTimeline(shipment, events),
    now,
  });
}

async function estimateOf(shipment: Shipment, events: LoggedEvent[], now: Instant) {
  const result = await estimate(shipment, events, now);
  if (result.withheld) throw new Error(`Withheld: ${result.reason}`);
  return result;
}

/** The chain as readable lines: "HUB_OUT@PERPIGNAN Wed 7 Oct 20:00 next_departure". */
function chain(shipment: Shipment, result: Estimate): string[] {
  return result.steps.map((step) => {
    const zone =
      shipment.plan.find((m) => m.key === step.milestoneKey)?.place.zone ?? "Europe/Madrid";
    return `${step.milestoneKey} ${formatStamp(step.at, step.precision, zone)} ${step.from}`;
  });
}

function doorDay(shipment: Shipment, result: Estimate): string {
  return localDate(result.at, shipment.consignee.place.zone);
}

/** A road shipment that is in the Perpignan hub since Tue 6 Oct 06:10 and has said nothing since. */
function inThePerpignanHub() {
  const shipment = roadShipment();
  const events = [
    confirmed(shipment, "PICKED_UP", at("2026-10-05 15:05")),
    confirmed(shipment, "HUB_IN", at("2026-10-05 18:30"), { place: VALENCIA }),
    confirmed(shipment, "HUB_OUT", at("2026-10-05 22:10"), { place: VALENCIA }),
    confirmed(shipment, "HUB_IN", at("2026-10-06 06:10"), { place: PERPIGNAN }),
  ];
  return { shipment, events };
}

/** An ocean shipment at sea: sailed Fri 25 Sep, planned into Veracruz Fri 9 Oct. */
function atSea() {
  const shipment = oceanShipment();
  const events = [
    confirmed(shipment, "PICKED_UP", at("2026-09-21 15:10")),
    confirmed(shipment, "GATE_IN", at("2026-09-22 08:31")),
    confirmed(shipment, "EXPORT_RELEASED", day("2026-09-23"), { precision: "day" }),
    confirmed(shipment, "LOADED", at("2026-09-25 03:10")),
    confirmed(shipment, "VESSEL_DEPARTED", at("2026-09-25 21:40")),
  ];
  return { shipment, events };
}

describe("propagation", () => {
  test("carries the plan's own gaps forward from the last confirmed milestone", async () => {
    const shipment = roadShipment();
    // Picked up two hours late: everything after it is two hours later, on the same days.
    const events = [confirmed(shipment, "PICKED_UP", at("2026-10-05 17:00"))];
    const result = await estimateOf(shipment, events, at("2026-10-05 17:30"));
    expect(chain(shipment, result)).toEqual([
      "HUB_IN@VALENCIA Mon 5 Oct 20:30 lane_plan",
      "HUB_OUT@VALENCIA Tue 6 Oct 00:00 lane_plan",
      "HUB_IN@PERPIGNAN Tue 6 Oct 08:00 lane_plan",
      "HUB_OUT@PERPIGNAN Tue 6 Oct 22:00 lane_plan",
      "OUT_FOR_DELIVERY@SAINT-PRIEST Thu 8 Oct 09:00 lane_plan",
      "DELIVERED@SAINT-PRIEST Thu 8 Oct 12:00 lane_plan",
    ]);
    expect(doorDay(shipment, result)).toBe("2026-10-08");
    expect(result.firmsUpWhen).toBe("the cargo is scanned into the Valencia hub");
  });

  test("a booking is not movement: before pickup the chain is the plan itself", async () => {
    const shipment = roadShipment();
    // The order was confirmed three hours late; the truck is still due at the planned time.
    const events = [confirmed(shipment, "BOOKED", at("2026-10-01 14:00"))];
    const result = await estimateOf(shipment, events, at("2026-10-02 09:00"));
    expect(chain(shipment, result)[0]).toBe("PICKED_UP@VALENCIA Mon 5 Oct 15:00 lane_plan");
    expect(doorDay(shipment, result)).toBe("2026-10-08");
  });

  test("an operator's later estimate for a milestone overrides the propagated time, an earlier one does not", async () => {
    const { shipment, events } = inThePerpignanHub();
    const now = at("2026-10-06 08:00");
    const later = estimated(shipment, "DELIVERED", at("2026-10-09 09:00"), { receivedAt: now });
    const earlier = estimated(shipment, "DELIVERED", at("2026-10-07 09:00"), { receivedAt: now });

    const pushed = await estimateOf(shipment, [...events, later], now);
    expect(chain(shipment, pushed).at(-1)).toBe(
      "DELIVERED@SAINT-PRIEST Fri 9 Oct 09:00 operator_estimate",
    );
    const optimistic = await estimateOf(shipment, [...events, earlier], now);
    expect(chain(shipment, optimistic).at(-1)).toBe(
      "DELIVERED@SAINT-PRIEST Thu 8 Oct 10:10 lane_plan",
    );
  });

  test("an estimate that only carries operator statements through the plan is declared, not inferred", async () => {
    const { shipment, events } = atSea();
    const now = at("2026-10-05 09:00");
    const delay = estimated(shipment, "VESSEL_ARRIVED", at("2026-10-11 08:00", MEXICO), {
      receivedAt: now,
    });
    const result = await estimateOf(shipment, [...events, delay], now);
    expect(estimateBasis(result)).toBe("declared");
    expect(result.assumption).toBeUndefined();
  });
});

describe("vessel schedule", () => {
  test("loading, departure and arrival follow the vessel, not our box", async () => {
    const shipment = oceanShipment();
    // Picked up a day late: the truck is late, the vessel is not.
    const events = [confirmed(shipment, "PICKED_UP", at("2026-09-22 15:00"))];
    const result = await estimateOf(shipment, events, at("2026-09-22 16:00"));
    expect(chain(shipment, result).slice(0, 5)).toEqual([
      "GATE_IN@VALENCIA Wed 23 Sep 08:00 lane_plan",
      "EXPORT_RELEASED@VALENCIA Thu 24 Sep lane_plan",
      "LOADED@VALENCIA Fri 25 Sep 03:00 vessel_schedule",
      "VESSEL_DEPARTED@VALENCIA Fri 25 Sep 20:00 vessel_schedule",
      "VESSEL_ARRIVED@VERACRUZ Fri 9 Oct 06:00 vessel_schedule",
    ]);
    expect(doorDay(shipment, result)).toBe("2026-10-14");
  });

  test("the line's estimate of the arrival moves everything behind it", async () => {
    const { shipment, events } = atSea();
    const now = at("2026-10-07 16:05");
    const delay = estimated(shipment, "VESSEL_ARRIVED", at("2026-10-11 08:00", MEXICO), {
      receivedAt: now,
    });
    const result = await estimateOf(shipment, [...events, delay], now);
    expect(chain(shipment, result)).toEqual([
      "VESSEL_ARRIVED@VERACRUZ Sun 11 Oct 08:00 operator_estimate",
      "DISCHARGED@VERACRUZ Mon 12 Oct 12:00 lane_plan",
      "IMPORT_LODGED@VERACRUZ Wed 14 Oct lane_plan",
      "IMPORT_RELEASED@VERACRUZ Thu 15 Oct lane_plan",
      "GATE_OUT@VERACRUZ Thu 15 Oct 15:00 lane_plan",
      "DELIVERED@QUERETARO Fri 16 Oct lane_plan",
    ]);
    expect(result.firmsUpWhen).toBe("the vessel berths");
  });

  test("an import entry lodged while the vessel is at sea does not anchor the chain: the door still follows the vessel", async () => {
    const { shipment, events } = atSea();
    const now = at("2026-10-07 16:05");
    const prelodged = confirmed(shipment, "IMPORT_LODGED", day("2026-10-07"), { precision: "day" });
    const delay = estimated(shipment, "VESSEL_ARRIVED", at("2026-10-11 08:00", MEXICO), {
      receivedAt: now,
    });
    const result = await estimateOf(shipment, [...events, prelodged, delay], now);
    expect(chain(shipment, result)).toEqual([
      "VESSEL_ARRIVED@VERACRUZ Sun 11 Oct 08:00 operator_estimate",
      "DISCHARGED@VERACRUZ Mon 12 Oct 12:00 lane_plan",
      "IMPORT_RELEASED@VERACRUZ Thu 15 Oct lane_plan",
      "GATE_OUT@VERACRUZ Thu 15 Oct 15:00 lane_plan",
      "DELIVERED@QUERETARO Fri 16 Oct lane_plan",
    ]);
    expect(result.firmsUpWhen).toBe("the vessel berths");
  });
});

describe("working days", () => {
  test("office and road milestones that land on a weekend move to Monday: delay is quantised", async () => {
    const { shipment, events } = atSea();
    const now = at("2026-10-07 16:05");
    // One more day at sea than in the previous test costs three days at the door.
    const delay = estimated(shipment, "VESSEL_ARRIVED", at("2026-10-12 08:00", MEXICO), {
      receivedAt: now,
    });
    const result = await estimateOf(shipment, [...events, delay], now);
    expect(chain(shipment, result).slice(-3)).toEqual([
      "IMPORT_RELEASED@VERACRUZ Fri 16 Oct lane_plan",
      "GATE_OUT@VERACRUZ Fri 16 Oct 15:00 lane_plan",
      "DELIVERED@QUERETARO Mon 19 Oct lane_plan",
    ]);
  });

  test("a discharge may fall on a Saturday: terminals work all week", async () => {
    const { shipment, events } = atSea();
    const result = await estimateOf(shipment, events, at("2026-10-07 16:00"));
    expect(chain(shipment, result)[1]).toBe("DISCHARGED@VERACRUZ Sat 10 Oct 10:00 lane_plan");
  });
});

describe("the window", () => {
  test("is one more working day wide while an import release is still ahead", async () => {
    const { shipment, events } = atSea();
    const result = await estimateOf(shipment, events, at("2026-10-07 16:00"));
    expect(localDate(result.window.earliest, MEXICO)).toBe("2026-10-14");
    expect(localDate(result.window.latest, MEXICO)).toBe("2026-10-15");
  });

  test("is a single day once customs is behind, or when there is no customs at all", async () => {
    const { shipment, events } = inThePerpignanHub();
    const result = await estimateOf(shipment, events, at("2026-10-06 08:00"));
    expect(result.window).toEqual({ earliest: result.at, latest: result.at });
    expect(result.precision).toBe("day");
  });
});

describe("missed departure", () => {
  test("a hub departure more than six hours overdue restarts the chain at the next linehaul", async () => {
    const { shipment, events } = inThePerpignanHub();
    const result = await estimateOf(shipment, events, at("2026-10-07 16:00"));
    expect(chain(shipment, result)).toEqual([
      "HUB_OUT@PERPIGNAN Wed 7 Oct 20:00 next_departure",
      "OUT_FOR_DELIVERY@SAINT-PRIEST Fri 9 Oct 07:00 lane_plan",
      "DELIVERED@SAINT-PRIEST Fri 9 Oct 10:00 lane_plan",
    ]);
    expect(doorDay(shipment, result)).toBe("2026-10-09");
    expect(estimateBasis(result)).toBe("inferred");
  });

  test("less than six hours overdue, it may still be leaving: the milestone is moved to now", async () => {
    const { shipment, events } = inThePerpignanHub();
    const now = at("2026-10-06 23:00");
    const result = await estimateOf(shipment, events, now);
    expect(chain(shipment, result)[0]).toBe("HUB_OUT@PERPIGNAN Tue 6 Oct 23:00 assumption");
    expect(doorDay(shipment, result)).toBe("2026-10-08");
    expect(estimateBasis(result)).toBe("inferred");
  });

  test("with no later departure on file, an overdue milestone is moved to now", async () => {
    const { shipment, events } = inThePerpignanHub();
    const now = at("2026-10-07 21:00");
    const result = await estimateOf(shipment, events, now);
    expect(chain(shipment, result)[0]).toBe("HUB_OUT@PERPIGNAN Wed 7 Oct 21:00 assumption");
  });
});

describe("open holds", () => {
  /** Discharged at Veracruz, import entry lodged Mon 5 Oct, then held by customs. */
  function heldAtCustoms(requires: DocumentType | null = "commercial_invoice") {
    const shipment = oceanShipment({ committedDate: "2026-10-09" });
    const events = [
      confirmed(shipment, "VESSEL_DEPARTED", at("2026-09-18 20:55")),
      confirmed(shipment, "VESSEL_ARRIVED", at("2026-10-02 05:40", MEXICO)),
      confirmed(shipment, "DISCHARGED", at("2026-10-03 09:15", MEXICO)),
      confirmed(shipment, "IMPORT_LODGED", day("2026-10-05"), { precision: "day" }),
      hold(shipment, "customs", "raised", at("2026-10-06 17:55"), requires ? { requires } : {}),
    ];
    return { shipment, events };
  }

  test("customs: the release is assumed on the next working day, and the estimate says it is conditional", async () => {
    const { shipment, events } = heldAtCustoms();
    const result = await estimateOf(shipment, events, at("2026-10-07 16:00"));
    expect(chain(shipment, result)).toEqual([
      "IMPORT_RELEASED@VERACRUZ Thu 8 Oct assumption",
      "GATE_OUT@VERACRUZ Thu 8 Oct 15:00 lane_plan",
      "DELIVERED@QUERETARO Fri 9 Oct lane_plan",
    ]);
    expect(result.assumption).toBe("if the corrected invoice reaches the broker today");
    expect(localDate(result.window.latest, MEXICO)).toBe("2026-10-12");
  });

  test("customs: a sailing that was never reported does not turn an import hold into an export one", async () => {
    const { shipment, events } = heldAtCustoms();
    const withoutDeparture = events.filter(
      (event) => !(event.fact.type === "milestone" && event.fact.code === "VESSEL_DEPARTED"),
    );
    const now = at("2026-10-07 16:00");
    const result = await estimateOf(shipment, withoutDeparture, now);
    expect(chain(shipment, result)).toEqual(
      chain(shipment, await estimateOf(shipment, events, now)),
    );
    expect(chain(shipment, result)[0]).toBe("IMPORT_RELEASED@VERACRUZ Thu 8 Oct assumption");
    expect(result.assumption).toBe("if the corrected invoice reaches the broker today");
  });

  test("customs: when the hold asks for no document, the assumption does not invent an invoice", async () => {
    const { shipment, events } = heldAtCustoms(null);
    const result = await estimateOf(shipment, events, at("2026-10-07 16:00"));
    expect(chain(shipment, result)[0]).toBe("IMPORT_RELEASED@VERACRUZ Thu 8 Oct assumption");
    expect(result.assumption).toBe(
      "if customs releases the goods on the next working day; what it needs is not known yet",
    );
  });

  test("customs: on a Friday the next working day is Monday", async () => {
    const { shipment, events } = heldAtCustoms();
    const result = await estimateOf(shipment, events, at("2026-10-09 16:00"));
    expect(chain(shipment, result)[0]).toBe("IMPORT_RELEASED@VERACRUZ Mon 12 Oct assumption");
    expect(doorDay(shipment, result)).toBe("2026-10-13");
  });

  test("carrier: the chain restarts at the next delivery round, if the goods are released for it", async () => {
    const { shipment, events } = inThePerpignanHub();
    const held = hold(shipment, "carrier", "raised", at("2026-10-06 07:00"));
    const result = await estimateOf(shipment, [...events, held], at("2026-10-06 09:00"));
    expect(chain(shipment, result)[0]).toBe("HUB_OUT@PERPIGNAN Wed 7 Oct 20:00 next_departure");
    expect(result.assumption).toBe("if the carrier releases the goods for that round");
    expect(doorDay(shipment, result)).toBe("2026-10-09");
  });

  test("carrier: with no round on file, the assumption is a release today", async () => {
    const shipment = roadShipment({ deadlines: [] });
    const events = [
      confirmed(shipment, "PICKED_UP", at("2026-10-05 15:05")),
      hold(shipment, "carrier", "raised", at("2026-10-05 16:00")),
    ];
    const result = await estimateOf(shipment, events, at("2026-10-05 17:00"));
    expect(result.assumption).toBe("if the carrier releases the goods today");
  });
});

/**
 * Invariants, checked through the port over the whole demo world at several instants and after
 * each scripted operator event. Pointing `estimator` at another adapter turns this block into
 * its offline evaluation.
 */
describe("invariants over the demo world", () => {
  const estimator: EtaEstimator = ruleBasedEstimator;

  async function snapshots(): Promise<
    { name: string; events: readonly LoggedEvent[]; now: Instant }[]
  > {
    const result = [];
    for (const offset of [0, 6 * HOUR, DAY, 3 * DAY, 9 * DAY]) {
      const world = await startEstela({ at: T0 + offset });
      result.push({
        name: `T0 + ${offset / HOUR} h`,
        events: world.store.events(),
        now: T0 + offset,
      });
    }
    for (const sequence of [["A"], ["A", "B"], ["D"]]) {
      const world = await startEstela();
      for (const id of sequence) {
        world.clock.advance(5 * MINUTE);
        await world.estela.demo.send(id);
      }
      result.push({
        name: `after ${sequence.join(" and ")}`,
        events: world.store.events(),
        now: world.clock.now(),
      });
    }
    return result;
  }

  test("earliest <= at <= latest in local days, steps in order, nothing in the past", async () => {
    let estimates = 0;
    for (const { name, events, now } of await snapshots()) {
      for (const shipment of SHIPMENTS) {
        const timeline = buildTimeline(shipment, events);
        // As the application asks: never about a delivered shipment, nor one that owes an update.
        const expectation = nextExpectation(timeline);
        if (isDelivered(timeline) || (expectation && now > expectation.by)) continue;
        const result = await estimator.estimate({ shipment, timeline, now });
        const label = `${shipment.id} ${name}`;
        expect(result.withheld, label).toBe(false);
        if (result.withheld) continue;
        estimates += 1;

        const zone = shipment.consignee.place.zone;
        const door = localDate(result.at, zone);
        expect(localDate(result.window.earliest, zone) <= door, label).toBe(true);
        expect(door <= localDate(result.window.latest, zone), label).toBe(true);
        expect(door >= localDate(now, zone), label).toBe(true);
        expect(result.steps.at(-1)?.milestoneKey, label).toBe(shipment.plan.at(-1)?.key);

        let previous: { at: Instant; day: string; minute: boolean } | null = null;
        for (const step of result.steps) {
          const place = shipment.plan.find((m) => m.key === step.milestoneKey)?.place;
          expect(place, `${label} ${step.milestoneKey}`).toBeDefined();
          if (!place) continue;
          const current = {
            at: step.at,
            day: localDate(step.at, place.zone),
            minute: step.precision === "minute",
          };
          const where = `${label} ${step.milestoneKey}`;
          // A day has no time of day: it is compared with its neighbours and with now as a day.
          if (current.minute) expect(current.at >= now, where).toBe(true);
          else expect(current.day >= localDate(now, place.zone), where).toBe(true);
          if (previous) {
            if (current.minute && previous.minute)
              expect(current.at >= previous.at, where).toBe(true);
            else expect(current.day >= previous.day, where).toBe(true);
          }
          previous = current;
        }
      }
    }
    expect(estimates).toBeGreaterThan(100);
  });
});
