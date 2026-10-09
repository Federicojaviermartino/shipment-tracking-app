import { describe, expect, test } from "vitest";
import { selectDates } from "./dates";
import type { EstelaEstimate, EstimateStep } from "./estimate";
import { detectExceptions, healthOf, type ShipmentException } from "./exceptions";
import type { ExceptionType, LoggedEvent } from "./log";
import type { Shipment } from "./shipment";
import {
  AI_READING,
  at,
  confirmed,
  day,
  documentOnFile,
  documentSent,
  estelaEstimate,
  estimated,
  hold,
  MEXICO,
  noticeSent,
  oceanShipment,
  PERPIGNAN,
  position,
  reviewed,
  roadShipment,
  VALENCIA,
} from "./test-support";
import { buildTimeline } from "./fold";
import { HOUR, MINUTE } from "./time";

function detect(
  shipment: Shipment,
  events: LoggedEvent[],
  estimate: EstelaEstimate | null,
  now: number,
): { exceptions: ShipmentException[]; health: string; types: ExceptionType[] } {
  const timeline = buildTimeline(shipment, events);
  const dates = selectDates(shipment, timeline, estimate, events, now);
  const exceptions = detectExceptions(shipment, timeline, dates, events, now);
  return {
    exceptions,
    health: healthOf(timeline, exceptions),
    types: exceptions.map((exception) => exception.type),
  };
}

const ocean = oceanShipment();
const T0 = at("2026-10-07 16:00");
const journey = (count: number): LoggedEvent[] =>
  ocean.plan
    .slice(0, count)
    .map((m) => confirmed(ocean, m.code, m.plannedAt, { precision: m.precision }));

const atSea = journey(6);
const lodged = journey(9);
const doorEta = (date: string, received: string) =>
  estimated(ocean, "DELIVERED", day(date), { precision: "day", receivedAt: at(received) });

const inferredStep: EstimateStep = {
  milestoneKey: "HUB_OUT@PERPIGNAN",
  label: "Next linehaul from Perpignan",
  at: at("2026-10-07 20:00"),
  precision: "minute",
  from: "next_departure",
};

describe("holds", () => {
  const raised = hold(ocean, "customs", "raised", at("2026-10-12 17:55"), {
    remark: "Gross-weight discrepancy between invoice and bill of lading",
  });
  const now = at("2026-10-13 09:00");

  test("an open customs hold is a held shipment, on what the operator declared", () => {
    const { exceptions, health } = detect(ocean, [...lodged, raised], null, now);
    expect(exceptions).toEqual([
      expect.objectContaining({
        id: "EST-1:customs_hold",
        type: "customs_hold",
        health: "held",
        basis: "declared",
        since: at("2026-10-12 17:55"),
      }),
    ]);
    expect(exceptions[0]?.needsConfirmation).toBeUndefined();
    expect(exceptions[0]?.evidence[0]).toMatchObject({
      provenance: { kind: "declared", source: "TGF" },
      eventKeys: [raised.key],
    });
    expect(health).toBe("held");
  });

  test("a hold read by a model fires for operations and says it needs confirmation", () => {
    const read = hold(ocean, "customs", "raised", at("2026-10-12 17:55"), { reading: AI_READING });
    const pending = detect(ocean, [...lodged, read], null, now).exceptions[0];
    expect(pending).toMatchObject({ type: "customs_hold", needsConfirmation: true });
    expect(pending?.evidence[0]?.provenance).toEqual({
      kind: "ai_reading",
      source: "TGF",
      confirmed: false,
    });

    const accepted = [...lodged, read, reviewed(read, true, at("2026-10-12 18:10"))];
    expect(detect(ocean, accepted, null, now).exceptions[0]?.needsConfirmation).toBeUndefined();

    const rejected = [...lodged, read, reviewed(read, false, at("2026-10-12 18:10"))];
    expect(detect(ocean, rejected, null, now).types).toEqual([]);
  });

  test("the exception is gone the moment the hold is cleared", () => {
    const cleared = hold(ocean, "customs", "cleared", at("2026-10-13 08:30"));
    expect(detect(ocean, [...lodged, raised, cleared], null, now).types).toEqual([]);
  });

  test("a carrier hold is its own type", () => {
    const road = roadShipment();
    const events = [
      confirmed(road, "PICKED_UP", at("2026-10-05 15:05")),
      hold(road, "carrier", "raised", at("2026-10-07 05:10"), { source: "EVS" }),
    ];
    const result = detect(road, events, null, T0);
    expect(result.types).toEqual(["carrier_hold"]);
    expect(result.health).toBe("held");
  });
});

describe("delay", () => {
  test("fires when the operator's door estimate is a later local day than committed", () => {
    const late = doorEta("2026-10-16", "2026-10-07 17:00");
    const { exceptions, health } = detect(ocean, [...atSea, late], null, at("2026-10-07 17:30"));
    expect(exceptions).toEqual([
      expect.objectContaining({
        type: "delay",
        health: "delayed",
        basis: "declared",
        since: at("2026-10-07 17:00"),
      }),
    ]);
    expect(exceptions[0]?.evidence[0]?.text).toBe(
      "Delivery declared for Fri 16 Oct, 1 day after the committed Thu 15 Oct",
    );
    expect(health).toBe("delayed");
  });

  test("does not fire for an estimate on the committed day itself", () => {
    const onTheDay = doorEta("2026-10-15", "2026-10-07 17:00");
    expect(detect(ocean, [...atSea, onTheDay], null, T0).types).toEqual([]);
  });

  test("fires once the committed day has passed at the destination, not before", () => {
    const lastMinute = at("2026-10-15 23:59", MEXICO);
    expect(detect(ocean, atSea, null, lastMinute).types).not.toContain("delay");

    const nextDay = detect(ocean, atSea, null, at("2026-10-16 00:01", MEXICO));
    expect(nextDay.types).toContain("delay");
    expect(nextDay.exceptions.find((e) => e.type === "delay")?.since).toBe(
      at("2026-10-16 00:00", MEXICO),
    );
  });

  test("has been a delay since the first of the two reasons", () => {
    const late = doorEta("2026-10-17", "2026-10-07 17:00");
    const overdue = detect(ocean, [...atSea, late], null, at("2026-10-16 10:00", MEXICO));
    const delay = overdue.exceptions.find((e) => e.type === "delay");
    expect(delay?.since).toBe(at("2026-10-07 17:00"));
    expect(delay?.evidence).toHaveLength(2);
  });
});

describe("predicted delay", () => {
  const vesselDelayed = estimated(ocean, "VESSEL_ARRIVED", at("2026-10-11 08:00", MEXICO), {
    receivedAt: at("2026-10-07 16:05"),
  });
  const events = [...atSea, doorEta("2026-10-14", "2026-10-06 08:30"), vesselDelayed];
  const now = at("2026-10-07 16:10");

  test("fires when Estela's door day is later than committed and no operator says so", () => {
    const { exceptions, health } = detect(ocean, events, estelaEstimate("2026-10-16"), now);
    expect(exceptions).toEqual([
      expect.objectContaining({ type: "predicted_delay", health: "at_risk", basis: "declared" }),
    ]);
    expect(exceptions[0]?.evidence.map((line) => line.text)).toEqual([
      "Estela estimates delivery on Fri 16 Oct, 1 day after the committed Thu 15 Oct",
      'Operator estimate for "Vessel arrived" is now Sun 11 Oct 08:00',
      "The operator's door estimate, Wed 14 Oct, was declared before that change",
    ]);
    expect(health).toBe("at_risk");
  });

  test("does not fire when the estimate lands on the committed day", () => {
    expect(detect(ocean, events, estelaEstimate("2026-10-15"), now).types).toEqual([]);
  });

  test("is inferred when a step of the estimate is Estela's own inference", () => {
    const estimate = estelaEstimate("2026-10-16", { steps: [inferredStep] });
    expect(detect(ocean, events, estimate, now).exceptions[0]?.basis).toBe("inferred");
  });

  test("does not fire next to a delay", () => {
    const late = doorEta("2026-10-16", "2026-10-07 16:08");
    const result = detect(ocean, [...events, late], estelaEstimate("2026-10-17"), now);
    expect(result.types).toEqual(["delay"]);
  });

  test("does not fire next to an open hold", () => {
    const raised = hold(ocean, "customs", "raised", at("2026-10-07 16:07"));
    const result = detect(ocean, [...events, raised], estelaEstimate("2026-10-19"), now);
    expect(result.types).toEqual(["customs_hold"]);
  });

  test("does not fire when the estimate is withheld", () => {
    expect(detect(ocean, events, { withheld: true, reason: "stale" }, now).types).toEqual([]);
  });
});

describe("cut-off risk", () => {
  const cutoff = at("2026-09-24 12:00");
  const inTerminal: LoggedEvent[] = [
    ...journey(3),
    documentOnFile(ocean, "packing_list", at("2026-09-16 12:00")),
  ];

  test("fires inside 48 hours of the export cut-off while a document for the release is missing", () => {
    const { exceptions, health } = detect(ocean, inTerminal, null, cutoff - 20 * HOUR);
    expect(exceptions).toEqual([
      expect.objectContaining({
        type: "cutoff_risk",
        health: "at_risk",
        basis: "rule",
        since: cutoff - 48 * HOUR,
        // The clock carries the booking's own deadline, so nothing has to look it up again.
        actBy: {
          at: cutoff,
          label: "Export clearance cut-off for NORAY ALTAIR 612W",
          deadline: ocean.deadlines[0],
        },
      }),
    ]);
    expect(exceptions[0]?.evidence[0]?.text).toBe("Commercial invoice not on file");
    expect(health).toBe("at_risk");
  });

  test("fires at exactly 48 hours, and not a minute earlier", () => {
    expect(detect(ocean, inTerminal, null, cutoff - 48 * HOUR).types).toEqual(["cutoff_risk"]);
    expect(detect(ocean, inTerminal, null, cutoff - 48 * HOUR - MINUTE).types).toEqual([]);
  });

  test("does not fire when the documents are on file", () => {
    const complete = [
      ...inTerminal,
      documentOnFile(ocean, "commercial_invoice", at("2026-09-16 12:00")),
    ];
    expect(detect(ocean, complete, null, cutoff - 20 * HOUR).types).toEqual([]);
  });

  test("does not fire once export customs has released", () => {
    expect(detect(ocean, [...inTerminal, ...journey(4)], null, cutoff - 20 * HOUR).types).toEqual(
      [],
    );
  });

  test("keeps firing once the cut-off has passed: missing the vessel does not close the case", () => {
    const { exceptions, health } = detect(ocean, inTerminal, null, cutoff + MINUTE);
    expect(exceptions).toEqual([
      expect.objectContaining({
        type: "cutoff_risk",
        state: "needs_action",
        actBy: expect.objectContaining({ at: cutoff, deadline: ocean.deadlines[0] }),
      }),
    ]);
    expect(health).toBe("at_risk");
  });

  test.each(["EXPORT_RELEASED", "LOADED", "VESSEL_DEPARTED"] as const)(
    "after the cut-off it stops once %s is confirmed, whatever was left unreported before it",
    (code) => {
      const planned = ocean.plan.find((milestone) => milestone.code === code);
      if (!planned) throw new Error(`No ${code} in the plan`);
      const reported = confirmed(ocean, code, planned.plannedAt, { precision: planned.precision });
      const afterSailing = at("2026-09-26 09:00");
      expect(detect(ocean, inTerminal, null, afterSailing).types).toEqual(["cutoff_risk"]);
      expect(detect(ocean, [...inTerminal, reported], null, afterSailing).types).toEqual([]);
    },
  );

  test("keeps firing after the document is sent, but then it is waiting on the forwarder", () => {
    const sent = documentSent(ocean, "commercial_invoice", "TGF", cutoff - 19 * HOUR);
    const [risk] = detect(ocean, [...inTerminal, sent], null, cutoff - 18 * HOUR).exceptions;
    expect(risk).toMatchObject({ type: "cutoff_risk", state: "waiting" });
    expect(risk?.evidence[0]?.text).toBe("Commercial invoice sent, not yet acknowledged");
  });
});

describe("stale", () => {
  const truck = roadShipment({ telematics: true });
  const events = [
    confirmed(truck, "PICKED_UP", at("2026-10-05 14:00")),
    position(truck, "La Jonquera, ES", at("2026-10-06 13:00")),
  ];

  test("fires when an expected update is overdue, and is its own health state", () => {
    const { exceptions, health } = detect(truck, events, { withheld: true, reason: "stale" }, T0);
    expect(exceptions).toEqual([
      expect.objectContaining({
        type: "stale",
        health: "stale",
        basis: "rule",
        since: at("2026-10-07 03:00"),
      }),
    ]);
    expect(exceptions[0]?.actBy).toBeUndefined();
    expect(health).toBe("stale");
  });

  test("does not fire while the update is not due yet", () => {
    expect(detect(truck, events, null, at("2026-10-07 02:59")).types).toEqual([]);
  });

  test("the instant the update is due is still in time: stale starts after it", () => {
    const due = at("2026-10-07 03:00");
    expect(detect(truck, events, null, due).types).toEqual([]);
    expect(detect(truck, events, null, due + 1).types).toEqual(["stale"]);
  });
});

describe("health", () => {
  test("a shipment with no open exception is on time", () => {
    const result = detect(ocean, [...atSea, doorEta("2026-10-14", "2026-10-06 08:30")], null, T0);
    expect(result).toMatchObject({ types: [], health: "on_time" });
  });

  test("a delivered shipment has no exceptions, whatever happened on the way", () => {
    const events = [
      ...journey(12),
      hold(ocean, "customs", "raised", at("2026-10-12 17:55")),
      doorEta("2026-10-20", "2026-10-12 08:30"),
    ];
    const result = detect(ocean, events, estelaEstimate("2026-10-21"), at("2026-10-22 10:00"));
    expect(result).toMatchObject({ types: [], health: "delivered" });
  });

  test("is the worst open exception: held over delayed over at risk over stale", () => {
    const road = roadShipment({ telematics: true });
    const base = [
      confirmed(road, "PICKED_UP", at("2026-10-05 15:05")),
      confirmed(road, "HUB_IN", at("2026-10-05 18:30"), { place: VALENCIA }),
      confirmed(road, "HUB_OUT", at("2026-10-05 22:10"), { place: VALENCIA }),
      confirmed(road, "HUB_IN", at("2026-10-06 06:10"), { place: PERPIGNAN }),
    ];
    const now = at("2026-10-09 09:00");

    const staleAndLate = detect(road, base, null, now);
    expect(staleAndLate.types).toEqual(["delay", "stale"]);
    expect(staleAndLate.health).toBe("delayed");

    const held = [
      ...base,
      hold(road, "carrier", "raised", at("2026-10-06 08:00"), { source: "EVS" }),
    ];
    const everything = detect(road, held, null, now);
    expect(everything.types).toEqual(["carrier_hold", "delay", "stale"]);
    expect(everything.health).toBe("held");
  });
});

describe("clocks: every exception takes its deadline from data", () => {
  test("a delay the customer has not been told about is due now", () => {
    const now = at("2026-10-07 17:30");
    const late = doorEta("2026-10-16", "2026-10-07 17:00");
    const [delay] = detect(ocean, [...atSea, late], null, now).exceptions;
    expect(delay?.actBy).toEqual({ at: now, label: "Customer not yet told" });

    const told = noticeSent(ocean, at("2026-10-07 17:20"), {
      day: "2026-10-16",
      at: day("2026-10-16"),
      precision: "day",
      basis: "operator_estimate",
    });
    const [after] = detect(ocean, [...atSea, late, told], null, now).exceptions;
    expect(after?.actBy).toBeUndefined();
  });

  test("a predicted delay on declared facts is due now; an inferred one runs to the next departure", () => {
    const road = roadShipment();
    const events = [
      confirmed(road, "PICKED_UP", at("2026-10-05 15:05")),
      confirmed(road, "HUB_IN", at("2026-10-06 06:10"), { place: PERPIGNAN }),
    ];

    const [declared] = detect(road, events, estelaEstimate("2026-10-09"), T0).exceptions;
    expect(declared).toMatchObject({ basis: "declared", actBy: { at: T0 } });

    const inferred = estelaEstimate("2026-10-09", { steps: [inferredStep] });
    const [risk] = detect(road, events, inferred, T0).exceptions;
    expect(risk).toMatchObject({
      basis: "inferred",
      actBy: { at: at("2026-10-07 20:00"), label: "Next linehaul leaves the Perpignan hub" },
    });
  });

  test("of several deadlines the one still ahead counts; once all are missed, the last one", () => {
    const road = roadShipment({
      deadlines: [
        { kind: "next_departure", at: at("2026-10-07 20:00"), label: "Wednesday linehaul" },
        { kind: "next_departure", at: at("2026-10-08 20:00"), label: "Thursday linehaul" },
      ],
    });
    const held = [
      confirmed(road, "PICKED_UP", at("2026-10-05 15:05")),
      hold(road, "carrier", "raised", at("2026-10-07 05:10"), { source: "EVS" }),
    ];
    const clock = (now: string) => detect(road, held, null, at(now)).exceptions[0]?.actBy?.label;
    expect(clock("2026-10-07 16:00")).toBe("Wednesday linehaul");
    expect(clock("2026-10-08 09:00")).toBe("Thursday linehaul");
    expect(clock("2026-10-08 21:00")).toBe("Thursday linehaul");
  });

  test("a carrier hold runs to the next departure, a customs hold to the end of free time", () => {
    const road = roadShipment();
    const carrier = [
      confirmed(road, "PICKED_UP", at("2026-10-05 15:05")),
      hold(road, "carrier", "raised", at("2026-10-07 05:10"), { source: "EVS" }),
    ];
    expect(detect(road, carrier, null, T0).exceptions[0]?.actBy?.at).toBe(at("2026-10-07 20:00"));

    const customs = [...lodged, hold(ocean, "customs", "raised", at("2026-10-12 17:55"))];
    expect(detect(ocean, customs, null, at("2026-10-13 09:00")).exceptions[0]?.actBy).toEqual({
      at: at("2026-10-16 23:59", MEXICO),
      label: "Free time ends: demurrage starts",
      deadline: ocean.deadlines[1],
    });
  });
});
