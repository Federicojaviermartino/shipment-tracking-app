import { describe, expect, test } from "vitest";
import type { LoggedEvent } from "./log";
import type { Shipment } from "./shipment";
import { nextExpectation } from "./staleness";
import {
  at,
  confirmed,
  day,
  estimated,
  MEXICO,
  oceanShipment,
  PERPIGNAN,
  position,
  roadShipment,
  VALENCIA,
} from "./test-support";
import { buildTimeline } from "./fold";
import { HOUR, MINUTE } from "./time";

const deadline = (shipment: Shipment, events: LoggedEvent[]) =>
  nextExpectation(buildTimeline(shipment, events))?.by ?? null;

const isStale = (shipment: Shipment, events: LoggedEvent[], now: number) => {
  const by = deadline(shipment, events);
  return by !== null && now > by;
};

describe("telematics silence", () => {
  const truck = roadShipment({ telematics: true });
  const pickedUp = confirmed(truck, "PICKED_UP", at("2026-10-05 14:00"));
  const lastPing = position(truck, "La Jonquera, ES", at("2026-10-06 13:00"));

  test("13 h 59 without a signal is fine, 14 h 01 is stale", () => {
    const events = [pickedUp, lastPing];
    expect(isStale(truck, events, lastPing.occurredAt + 14 * HOUR - MINUTE)).toBe(false);
    expect(isStale(truck, events, lastPing.occurredAt + 14 * HOUR + MINUTE)).toBe(true);
  });

  test("any new signal from the carrier pushes the deadline out", () => {
    const back = position(truck, "Besançon, FR", at("2026-10-07 16:03"));
    expect(deadline(truck, [pickedUp, lastPing, back])).toBe(back.occurredAt + 14 * HOUR);
  });

  test("names the silent carrier and its last signal", () => {
    expect(nextExpectation(buildTimeline(truck, [pickedUp, lastPing]))?.reason).toEqual({
      kind: "telematics_silence",
      source: "EVS",
      lastSignalAt: lastPing.occurredAt,
    });
  });

  test("does not apply to a network that only scans at its hubs", () => {
    const groupage = roadShipment();
    const scanned = [
      confirmed(groupage, "PICKED_UP", at("2026-10-05 15:05")),
      confirmed(groupage, "HUB_IN", at("2026-10-05 18:30"), { place: VALENCIA }),
      confirmed(groupage, "HUB_OUT", at("2026-10-05 22:10"), { place: VALENCIA }),
      confirmed(groupage, "HUB_IN", at("2026-10-06 06:10"), { place: PERPIGNAN }),
    ];
    expect(deadline(groupage, scanned)).toBeNull();
    expect(isStale(groupage, scanned, at("2026-10-09 12:00"))).toBe(false);
  });
});

describe("an expected milestone is overdue", () => {
  test("a pickup is expected within 4 hours of its planned time", () => {
    const road = roadShipment();
    const booked = confirmed(road, "BOOKED", at("2026-10-01 11:05"));
    expect(deadline(road, [booked])).toBe(at("2026-10-05 19:00"));
    expect(deadline(road, [])).toBe(at("2026-10-05 19:00"));
  });

  const ocean = oceanShipment();
  const sailed = ocean.plan
    .slice(0, 6)
    .map((m) => confirmed(ocean, m.code, m.plannedAt, { precision: m.precision }));

  test("a vessel is never stale by silence: only 24 hours after it was due", () => {
    const due = at("2026-10-09 06:00", MEXICO);
    expect(deadline(ocean, sailed)).toBe(due + 24 * HOUR);
    expect(isStale(ocean, sailed, at("2026-10-07 16:00"))).toBe(false);
    expect(isStale(ocean, sailed, due + 24 * HOUR + MINUTE)).toBe(true);
  });

  test("the operator's estimate replaces the plan as the expectation", () => {
    const delayed = estimated(ocean, "VESSEL_ARRIVED", at("2026-10-11 08:00", MEXICO), {
      receivedAt: at("2026-10-07 16:05"),
    });
    expect(deadline(ocean, [...sailed, delayed])).toBe(at("2026-10-12 08:00", MEXICO));
  });

  test("a delivery expected yesterday is stale only after 10:00 local today", () => {
    const outForDelivery = ocean.plan
      .slice(0, 11)
      .map((m) => confirmed(ocean, m.code, m.plannedAt, { precision: m.precision }));
    const door = estimated(ocean, "DELIVERED", day("2026-10-14"), {
      precision: "day",
      receivedAt: at("2026-10-06 08:30"),
    });
    const events = [...outForDelivery, door];
    expect(deadline(ocean, events)).toBe(at("2026-10-15 10:00", MEXICO));
    expect(isStale(ocean, events, at("2026-10-15 09:59", MEXICO))).toBe(false);
    expect(isStale(ocean, events, at("2026-10-15 10:01", MEXICO))).toBe(true);
  });

  test("milestones without a grace rule never make a shipment stale", () => {
    const inPort = ocean.plan
      .slice(0, 8)
      .map((m) => confirmed(ocean, m.code, m.plannedAt, { precision: m.precision }));
    expect(deadline(ocean, inPort)).toBeNull();
  });

  test("a delivered shipment owes no update", () => {
    const delivered = ocean.plan.map((m) =>
      confirmed(ocean, m.code, m.plannedAt, { precision: m.precision }),
    );
    expect(deadline(ocean, delivered)).toBeNull();
  });
});
