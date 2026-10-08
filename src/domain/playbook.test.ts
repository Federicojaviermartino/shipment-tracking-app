import { describe, expect, test } from "vitest";
import { selectDates } from "./dates";
import type { EstelaEstimate, EstimateStep } from "./estimate";
import { detectExceptions, type ShipmentException } from "./exceptions";
import type { LoggedEvent, PublishedSnapshot } from "./log";
import type { Actor } from "./perimeter";
import { canPerform, type Step } from "./playbook";
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
  operatorContacted,
  PERPIGNAN,
  position,
  reviewed,
  roadShipment,
} from "./test-support";
import { buildTimeline } from "./fold";

function firstCase(
  shipment: Shipment,
  events: LoggedEvent[],
  estimate: EstelaEstimate | null,
  now: number,
): ShipmentException {
  const timeline = buildTimeline(shipment, events);
  const dates = selectDates(shipment, timeline, estimate, events, now);
  const [first] = detectExceptions(shipment, timeline, dates, events, now);
  if (!first) throw new Error("Expected an exception");
  return first;
}

const kinds = (exception: ShipmentException) => exception.steps.map((step) => step.kind);
const states = (exception: ShipmentException) =>
  Object.fromEntries(exception.steps.map((step) => [step.kind, step.state]));
const step = (exception: ShipmentException, kind: Step["kind"]) =>
  exception.steps.find((candidate) => candidate.kind === kind);

const snapshot = (date: string, basis: PublishedSnapshot["basis"]): PublishedSnapshot => ({
  day: date,
  at: day(date),
  precision: "day",
  basis,
});

const ocean = oceanShipment();
const journey = (count: number): LoggedEvent[] =>
  ocean.plan
    .slice(0, count)
    .map((m) => confirmed(ocean, m.code, m.plannedAt, { precision: m.precision }));
const doorEta = (date: string, received: string) =>
  estimated(ocean, "DELIVERED", day(date), { precision: "day", receivedAt: at(received) });
const inferredStep: EstimateStep = {
  milestoneKey: "HUB_OUT@PERPIGNAN",
  label: "Next linehaul from Perpignan",
  at: at("2026-10-07 20:00"),
  precision: "minute",
  from: "next_departure",
};

describe("the steps proposed for each exception", () => {
  const T0 = at("2026-10-07 16:00");
  const road = roadShipment();
  const inHub = [
    confirmed(road, "PICKED_UP", at("2026-10-05 15:05")),
    confirmed(road, "HUB_IN", at("2026-10-06 06:10"), { place: PERPIGNAN }),
  ];

  test("customs hold: send the corrected invoice to the broker, then notify the customer", () => {
    const held = [...journey(9), hold(ocean, "customs", "raised", at("2026-10-12 17:55"))];
    const exception = firstCase(ocean, held, null, at("2026-10-13 09:00"));
    expect(kinds(exception)).toEqual(["send_document", "notify_customer"]);
    expect(step(exception, "send_document")).toMatchObject({
      docType: "commercial_invoice",
      operatorId: "TGF",
      requires: "logistics",
    });
  });

  test("customs hold read by a model: confirming the reading comes first", () => {
    const read = hold(ocean, "customs", "raised", at("2026-10-12 17:55"), { reading: AI_READING });
    const exception = firstCase(ocean, [...journey(9), read], null, at("2026-10-13 09:00"));
    expect(kinds(exception)).toEqual(["confirm_reading", "send_document", "notify_customer"]);
    expect(step(exception, "confirm_reading")).toMatchObject({ eventKey: read.key, state: "todo" });
  });

  test("carrier hold: contact the carrier, then notify the customer", () => {
    const held = [
      ...inHub,
      hold(road, "carrier", "raised", at("2026-10-07 05:10"), { source: "EVS" }),
    ];
    const exception = firstCase(road, held, null, T0);
    expect(kinds(exception)).toEqual(["contact_operator", "notify_customer"]);
    expect(step(exception, "contact_operator")).toMatchObject({ operatorId: "EVS" });
  });

  test("delay: notify the customer", () => {
    const exception = firstCase(
      ocean,
      [...journey(6), doorEta("2026-10-16", "2026-10-07 15:00")],
      null,
      T0,
    );
    expect(kinds(exception)).toEqual(["notify_customer"]);
    expect(step(exception, "notify_customer")?.requires).toBe("any_internal");
  });

  test("predicted delay on declared facts: notify the customer", () => {
    const exception = firstCase(road, inHub, estelaEstimate("2026-10-09"), T0);
    expect(kinds(exception)).toEqual(["notify_customer"]);
  });

  test("predicted delay that Estela inferred: ask the operator before alarming the customer", () => {
    const estimate = estelaEstimate("2026-10-09", { steps: [inferredStep] });
    const exception = firstCase(road, inHub, estimate, T0);
    expect(kinds(exception)).toEqual(["contact_operator", "notify_customer"]);
    expect(step(exception, "contact_operator")).toMatchObject({ operatorId: "EVS" });
  });

  test("cut-off risk: send the document that is not on file to the forwarder", () => {
    const inTerminal = [
      ...journey(3),
      documentOnFile(ocean, "packing_list", at("2026-09-16 12:00")),
    ];
    const exception = firstCase(ocean, inTerminal, null, at("2026-09-23 16:00"));
    expect(exception.steps).toEqual([
      expect.objectContaining({
        kind: "send_document",
        docType: "commercial_invoice",
        operatorId: "TGF",
        state: "todo",
      }),
    ]);
  });

  test("stale: ask the silent operator for position and ETA", () => {
    const truck = roadShipment({ telematics: true });
    const silent = [
      confirmed(truck, "PICKED_UP", at("2026-10-05 14:00")),
      position(truck, "La Jonquera, ES", at("2026-10-06 13:00")),
    ];
    const exception = firstCase(truck, silent, { withheld: true, reason: "stale" }, T0);
    expect(exception.steps).toEqual([
      expect.objectContaining({ kind: "contact_operator", operatorId: "EVS", state: "todo" }),
    ]);
  });
});

describe("whether a step is done is read from the log", () => {
  const read = hold(ocean, "customs", "raised", at("2026-10-12 17:55"), { reading: AI_READING });
  const held = [...journey(9), read];
  const now = at("2026-10-13 12:00");
  const estimate = estelaEstimate("2026-10-16", { assumption: "if the invoice arrives today" });

  test("each command that was logged ticks its own step", () => {
    const review = reviewed(read, true, at("2026-10-13 09:05"));
    const sent = documentSent(ocean, "commercial_invoice", "TGF", at("2026-10-13 09:20"));
    const told = noticeSent(
      ocean,
      at("2026-10-13 09:40"),
      snapshot("2026-10-16", "estela_estimate"),
    );

    expect(states(firstCase(ocean, held, estimate, now))).toEqual({
      confirm_reading: "todo",
      send_document: "todo",
      notify_customer: "todo",
    });
    expect(states(firstCase(ocean, [...held, review], estimate, now))).toMatchObject({
      confirm_reading: "done",
      send_document: "todo",
    });
    const done = firstCase(ocean, [...held, review, sent, told], estimate, now);
    expect(states(done)).toEqual({
      confirm_reading: "done",
      send_document: "done",
      notify_customer: "done",
    });
    expect(step(done, "send_document")).toMatchObject({
      doneBy: "marta.soler",
      doneAt: at("2026-10-13 09:20"),
    });
  });

  test("the case waits once every step is done and the rule still fires", () => {
    const all = [
      ...held,
      reviewed(read, true, at("2026-10-13 09:05")),
      documentSent(ocean, "commercial_invoice", "TGF", at("2026-10-13 09:20")),
      noticeSent(ocean, at("2026-10-13 09:40"), snapshot("2026-10-16", "estela_estimate")),
    ];
    expect(firstCase(ocean, held, estimate, now).state).toBe("needs_action");
    expect(firstCase(ocean, all.slice(0, -1), estimate, now).state).toBe("needs_action");
    expect(firstCase(ocean, all, estimate, now).state).toBe("waiting");
  });

  test("a document sent before the exception began, or of another type, does not count", () => {
    const tooEarly = documentSent(ocean, "commercial_invoice", "TGF", at("2026-10-12 10:00"));
    const wrongType = documentSent(ocean, "packing_list", "TGF", at("2026-10-13 09:20"));
    const exception = firstCase(ocean, [...held, tooEarly, wrongType], estimate, now);
    expect(step(exception, "send_document")?.state).toBe("todo");
  });

  test("contacting the operator ticks the step only for that operator and after the fact", () => {
    const truck = roadShipment({ telematics: true });
    const silent = [
      confirmed(truck, "PICKED_UP", at("2026-10-05 14:00")),
      position(truck, "La Jonquera, ES", at("2026-10-06 13:00")),
    ];
    const T0 = at("2026-10-07 16:00");
    const stale = (extra: LoggedEvent[]) =>
      firstCase(truck, [...silent, ...extra], { withheld: true, reason: "stale" }, T0);

    expect(stale([operatorContacted(truck, "CRZ", at("2026-10-07 15:00"))]).state).toBe(
      "needs_action",
    );
    expect(stale([operatorContacted(truck, "EVS", at("2026-10-06 18:00"))]).state).toBe(
      "needs_action",
    );
    expect(stale([operatorContacted(truck, "EVS", at("2026-10-07 15:00"))]).state).toBe("waiting");
  });
});

describe("notify the customer: told the current best door day", () => {
  const sailed = journey(6);
  const forwarderSays14 = doorEta("2026-10-14", "2026-10-06 08:30");
  const vesselDelayed = estimated(ocean, "VESSEL_ARRIVED", at("2026-10-11 08:00", MEXICO), {
    receivedAt: at("2026-10-07 16:05"),
  });
  const afterDelay = [...sailed, forwarderSays14, vesselDelayed];
  const now = at("2026-10-07 18:00");
  const notify = (events: LoggedEvent[], estimate: EstelaEstimate | null) =>
    step(firstCase(ocean, events, estimate, now), "notify_customer")?.state;

  test("is done when the latest notice carries the best door day", () => {
    const told = noticeSent(
      ocean,
      at("2026-10-07 16:20"),
      snapshot("2026-10-16", "estela_estimate"),
    );
    expect(notify(afterDelay, estelaEstimate("2026-10-16"))).toBe("todo");
    expect(notify([...afterDelay, told], estelaEstimate("2026-10-16"))).toBe("done");
  });

  test("becomes outdated when the best door day moves after the customer was told", () => {
    const told = noticeSent(
      ocean,
      at("2026-10-07 16:20"),
      snapshot("2026-10-16", "estela_estimate"),
    );
    const exception = firstCase(ocean, [...afterDelay, told], estelaEstimate("2026-10-19"), now);
    expect(step(exception, "notify_customer")?.state).toBe("outdated");
    expect(exception.state).toBe("needs_action");
    expect(exception.actBy?.label).toBe("Customer not yet told");
  });

  test("stays done when the operator later confirms the same day: no second notice", () => {
    const told = noticeSent(
      ocean,
      at("2026-10-07 16:20"),
      snapshot("2026-10-16", "estela_estimate"),
    );
    const forwarderSays16 = doorEta("2026-10-16", "2026-10-07 17:00");
    const exception = firstCase(
      ocean,
      [...afterDelay, told, forwarderSays16],
      estelaEstimate("2026-10-16"),
      now,
    );
    expect(exception).toMatchObject({ type: "delay", state: "waiting" });
    expect(step(exception, "notify_customer")?.state).toBe("done");
  });

  test("is outdated again if the operator then declares a different day", () => {
    const told = noticeSent(
      ocean,
      at("2026-10-07 16:20"),
      snapshot("2026-10-16", "estela_estimate"),
    );
    const forwarderSays19 = doorEta("2026-10-19", "2026-10-07 17:00");
    expect(notify([...afterDelay, told, forwarderSays19], estelaEstimate("2026-10-16"))).toBe(
      "outdated",
    );
  });

  test("with no door day to give, any notice sent since the exception began is enough", () => {
    const road = roadShipment();
    const heldAt = at("2026-10-07 05:10");
    const events = [
      confirmed(road, "PICKED_UP", at("2026-10-05 15:05")),
      hold(road, "carrier", "raised", heldAt, { source: "EVS" }),
    ];
    const state = (extra: LoggedEvent[]) =>
      step(firstCase(road, [...events, ...extra], null, at("2026-10-07 16:00")), "notify_customer")
        ?.state;

    expect(state([])).toBe("todo");
    expect(state([noticeSent(road, at("2026-10-06 12:00"), null)])).toBe("todo");
    expect(state([noticeSent(road, at("2026-10-07 09:00"), null)])).toBe("done");
  });
});

describe("role capability", () => {
  const marta: Actor = {
    kind: "internal",
    userId: "marta.soler",
    name: "Marta Soler",
    title: "Logistics Operations Lead",
    role: "logistics",
    siteIds: "all",
    accountIds: "all",
  };
  const lucia: Actor = {
    ...marta,
    userId: "lucia.ferrer",
    name: "Lucía Ferrer",
    role: "customer_support",
  };
  const mariana: Actor = {
    kind: "external",
    userId: "mariana.olvera",
    name: "Mariana Olvera",
    title: "Purchasing Coordinator",
    accountId: "AQB",
  };

  test("logistics may perform every step", () => {
    expect(canPerform(marta, "logistics")).toBe(true);
    expect(canPerform(marta, "any_internal")).toBe(true);
  });

  test("customer support may notify customers and nothing else", () => {
    expect(canPerform(lucia, "any_internal")).toBe(true);
    expect(canPerform(lucia, "logistics")).toBe(false);
  });

  test("a customer may perform none", () => {
    expect(canPerform(mariana, "any_internal")).toBe(false);
    expect(canPerform(mariana, "logistics")).toBe(false);
  });

  test("only notifying the customer is open to customer support", () => {
    const read = hold(ocean, "customs", "raised", at("2026-10-12 17:55"), { reading: AI_READING });
    const exception = firstCase(ocean, [...journey(9), read], null, at("2026-10-13 09:00"));
    expect(
      Object.fromEntries(exception.steps.map((s) => [s.kind, canPerform(lucia, s.requires)])),
    ).toEqual({
      confirm_reading: false,
      send_document: false,
      notify_customer: true,
    });
  });
});
