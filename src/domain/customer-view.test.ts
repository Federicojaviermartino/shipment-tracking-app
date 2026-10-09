import { describe, expect, test } from "vitest";
import { toCustomerView, type CustomerView } from "./customer-view";
import type { EstelaEstimate } from "./estimate";
import type { LoggedEvent, PublishedSnapshot } from "./log";
import { projectShipment } from "./projection";
import type { Shipment } from "./shipment";
import {
  AI_READING,
  at,
  confirmed,
  day,
  documentOnFile,
  estelaEstimate,
  estimated,
  hold,
  MEXICO,
  noticeSent,
  oceanShipment,
  operatorContacted,
  PERPIGNAN,
  position,
  QUERETARO,
  remark,
  reviewed,
  roadShipment,
  VALENCIA,
} from "./test-support";

function view(
  shipment: Shipment,
  events: LoggedEvent[],
  estimate: EstelaEstimate | null,
  now: number,
): CustomerView {
  const projection = projectShipment({ shipment, events, estimate, now });
  return toCustomerView({
    shipment,
    timeline: projection.timeline,
    dates: projection.dates,
    health: projection.health,
    events,
    now,
  });
}

const ocean = oceanShipment();
const T0 = at("2026-10-07 16:00");
const journey = (count: number): LoggedEvent[] =>
  ocean.plan
    .slice(0, count)
    .map((m) => confirmed(ocean, m.code, m.plannedAt, { precision: m.precision }));

const portEta = estimated(ocean, "VESSEL_ARRIVED", at("2026-10-09 06:00", MEXICO), {
  receivedAt: at("2026-10-05 07:00"),
});
const doorEta = estimated(ocean, "DELIVERED", day("2026-10-14"), {
  precision: "day",
  receivedAt: at("2026-10-06 08:30"),
});
const atSea = [...journey(6), portEta, doorEta];
const vesselDelayed = estimated(ocean, "VESSEL_ARRIVED", at("2026-10-11 08:00", MEXICO), {
  receivedAt: at("2026-10-07 16:05"),
});
const estela16: PublishedSnapshot = {
  day: "2026-10-16",
  at: day("2026-10-16"),
  precision: "day",
  basis: "estela_estimate",
};

describe("facts flow", () => {
  const customer = view(ocean, atSea, estelaEstimate("2026-10-14"), T0);

  test("an on-time shipment reads on time, with the carrier's date as an estimate", () => {
    expect(customer).toMatchObject({
      orderRef: "70001",
      stage: "at_sea",
      verdict: "on_time",
      committed: "2026-10-15",
      published: { kind: "estimated", day: "2026-10-14", by: { kind: "carrier" } },
      reason: null,
    });
  });

  test("shows the customer-level milestones with what is confirmed, estimated and planned", () => {
    expect(customer.milestones.map((m) => [m.code, m.state, m.when?.kind ?? null])).toEqual([
      ["PICKED_UP", "done", "confirmed"],
      ["GATE_IN", "done", "confirmed"],
      ["VESSEL_DEPARTED", "done", "confirmed"],
      ["VESSEL_ARRIVED", "next", "estimated"],
      ["IMPORT_LODGED", "upcoming", "planned"],
      ["IMPORT_RELEASED", "upcoming", "planned"],
      ["GATE_OUT", "upcoming", "planned"],
      ["DELIVERED", "upcoming", "estimated"],
    ]);
  });

  test("carries the identifiers an importer needs", () => {
    expect(customer.identifiers).toEqual({
      container: "NRYU4821373",
      billOfLading: "NRYVLC1",
      vessel: "NORAY ALTAIR",
      voyage: "612W",
      portEta: {
        place: { name: "Veracruz", country: "MX", zone: "America/Mexico_City" },
        when: { at: at("2026-10-09 06:00", MEXICO), precision: "minute", kind: "estimated" },
      },
      incoterm: { code: "DAP", place: "Querétaro", consigneeClearsImport: true },
    });
  });

  test("carries the route as stops and legs with the cargo placed on it, and no word on who carries it", () => {
    expect(customer.route).toEqual({
      stops: [
        {
          place: { name: "Zaragoza", country: "ES", zone: "Europe/Madrid" },
          role: "origin",
          gate: null,
        },
        {
          place: { name: "Valencia", country: "ES", zone: "Europe/Madrid" },
          role: "port",
          gate: "export",
        },
        {
          place: { name: "Veracruz", country: "MX", zone: "America/Mexico_City" },
          role: "port",
          gate: "import",
        },
        {
          place: { name: "Querétaro", country: "MX", zone: "America/Mexico_City" },
          role: "consignee",
          gate: null,
        },
      ],
      legs: [{ mode: "road" }, { mode: "sea" }, { mode: "road" }],
      position: { on: "leg", index: 1 },
    });
  });

  test("an operator's new port ETA reaches the customer as soon as it lands", () => {
    const after = view(ocean, [...atSea, vesselDelayed], estelaEstimate("2026-10-16"), T0);
    expect(after.identifiers.portEta?.when.at).toBe(at("2026-10-11 08:00", MEXICO));
  });

  test("a road shipment inside the EU has nothing to clear", () => {
    const road = roadShipment();
    expect(view(road, [], null, T0).identifiers.incoterm).toEqual({
      code: "CPT",
      place: "Saint-Priest",
      consigneeClearsImport: false,
    });
  });

  test("a delivered shipment reads delivered, with the confirmed day", () => {
    const delivered = view(ocean, journey(12), null, at("2026-10-15 09:00"));
    expect(delivered).toMatchObject({
      stage: "delivered",
      verdict: "delivered",
      published: { kind: "confirmed", day: "2026-10-14" },
    });
  });

  test("a skipped milestone reads as not reported, with no time at all", () => {
    const skipped = atSea.filter(
      (e) => !(e.kind === "operator" && e.fact.type === "milestone" && e.fact.code === "GATE_IN"),
    );
    const gateIn = view(ocean, skipped, null, T0).milestones.find((m) => m.code === "GATE_IN");
    expect(gateIn).toMatchObject({ state: "not_reported", when: null });
  });

  test("a plan that has already been missed is not shown as a date", () => {
    const afterThePlan = at("2026-10-12 09:00", MEXICO);
    const arrival = view(ocean, journey(6), null, afterThePlan).milestones.find(
      (m) => m.code === "VESSEL_ARRIVED",
    );
    expect(arrival?.when).toBeNull();
  });
});

describe("predictions wait", () => {
  const afterDelay = [...atSea, vesselDelayed];

  test("no green lie: with a predicted delay open, the verdict makes no claim", () => {
    const customer = view(ocean, afterDelay, estelaEstimate("2026-10-16"), T0);
    expect(customer.verdict).toBe("in_progress");
    expect(customer.published).toEqual({ kind: "under_review", was: "2026-10-14" });
  });

  test("makes no promise next to a date under review, even when Estela still expects it in time", () => {
    const roomy = oceanShipment({ committedDate: "2026-10-20" });
    const events = [
      ...roomy.plan
        .slice(0, 6)
        .map((m) => confirmed(roomy, m.code, m.plannedAt, { precision: m.precision })),
      estimated(roomy, "DELIVERED", day("2026-10-14"), {
        precision: "day",
        receivedAt: at("2026-10-06 08:30"),
      }),
      estimated(roomy, "VESSEL_ARRIVED", at("2026-10-11 08:00", MEXICO), {
        receivedAt: at("2026-10-07 16:05"),
      }),
    ];
    const customer = view(roomy, events, estelaEstimate("2026-10-16"), T0);
    expect(customer.published).toEqual({ kind: "under_review", was: "2026-10-14" });
    expect(customer.verdict).toBe("in_progress");
  });

  test("an Estela estimate that nobody approved appears nowhere in the view", () => {
    const customer = view(ocean, afterDelay, estelaEstimate("2026-10-16"), T0);
    expect(JSON.stringify(customer)).not.toContain("2026-10-16");
    expect(JSON.stringify(customer)).not.toContain(String(day("2026-10-16")));
    expect(customer.milestones.find((m) => m.code === "DELIVERED")?.when).toBeNull();
  });

  test("once a named person approves a notice, the date and the notice are published", () => {
    const sent = noticeSent(ocean, at("2026-10-07 16:20"), estela16);
    const customer = view(ocean, [...afterDelay, sent], estelaEstimate("2026-10-16"), T0);
    expect(customer).toMatchObject({
      verdict: "delayed",
      published: {
        kind: "estimated",
        day: "2026-10-16",
        by: { kind: "notice", approvedBy: "marta.soler" },
      },
      reason: { from: "notice", text: "Order 70001: new delivery estimate" },
    });
    expect(customer.notices).toEqual([
      expect.objectContaining({ id: sent.id, approvedBy: "marta.soler", published: estela16 }),
    ]);
    expect(customer.milestones.find((m) => m.code === "DELIVERED")?.when).toEqual({
      at: day("2026-10-16"),
      precision: "day",
      kind: "estimated",
    });
  });

  test("a notice stays on the page after things are back on time, but no longer as the reason", () => {
    const earlier = noticeSent(ocean, at("2026-10-05 10:00"), {
      day: "2026-10-14",
      at: day("2026-10-14"),
      precision: "day",
      basis: "operator_estimate",
    });
    const customer = view(ocean, [...atSea, earlier], estelaEstimate("2026-10-14"), T0);
    expect(customer).toMatchObject({ verdict: "on_time", reason: null });
    expect(customer.notices).toHaveLength(1);
  });

  test("a delay the carrier itself declared needs nobody's approval", () => {
    const late = estimated(ocean, "DELIVERED", day("2026-10-16"), {
      precision: "day",
      receivedAt: at("2026-10-07 17:00"),
    });
    const customer = view(ocean, [...afterDelay, late], estelaEstimate("2026-10-16"), T0);
    expect(customer).toMatchObject({
      verdict: "delayed",
      published: { day: "2026-10-16", by: { kind: "carrier" } },
      reason: { from: "fact", text: "The carrier has announced a later delivery date." },
    });
  });

  test("never reads on time without an estimate to stand behind it", () => {
    const unavailable = { withheld: true as const, reason: "the estimator is unavailable" };
    expect(view(ocean, atSea, estelaEstimate("2026-10-14"), T0).verdict).toBe("on_time");
    expect(view(ocean, atSea, unavailable, T0).verdict).toBe("in_progress");
    expect(view(ocean, atSea, null, T0).verdict).toBe("in_progress");
  });

  test("never reads on time while any exception is open, even one that is not about the date", () => {
    const truck = roadShipment({ telematics: true });
    const silent = [
      confirmed(truck, "PICKED_UP", at("2026-10-05 14:00")),
      position(truck, "La Jonquera, ES", at("2026-10-06 13:00")),
    ];
    expect(view(truck, silent, { withheld: true, reason: "stale" }, T0).verdict).toBe(
      "in_progress",
    );
  });
});

describe("holds", () => {
  const lodged = journey(9);
  const now = at("2026-10-13 09:00");

  test("a hold that a model read and nobody confirmed is not shown to the customer", () => {
    const read = hold(ocean, "customs", "raised", at("2026-10-12 17:55"), { reading: AI_READING });
    const customer = view(ocean, [...lodged, read], null, now);
    expect(customer).toMatchObject({ verdict: "in_progress", hold: null, holds: [] });
    expect(JSON.stringify(customer)).not.toContain("document check");
  });

  test("a confirmed hold reads on hold, in fixed wording", () => {
    const read = hold(ocean, "customs", "raised", at("2026-10-12 17:55"), { reading: AI_READING });
    const accepted = [...lodged, read, reviewed(read, true, at("2026-10-12 18:10"))];
    expect(view(ocean, accepted, null, now)).toMatchObject({
      verdict: "on_hold",
      hold: "customs",
      holds: [{ hold: "customs", since: at("2026-10-12 17:55") }],
      reason: { from: "fact", text: "Customs is holding the shipment for a check." },
    });
  });

  test("a hold reported by a table reaches the customer even while a reading of the same hold waits", () => {
    const read = hold(ocean, "customs", "raised", at("2026-10-12 17:55"), { reading: AI_READING });
    const mapped = hold(ocean, "customs", "raised", at("2026-10-13 08:30"));
    const projection = projectShipment({
      shipment: ocean,
      events: [...lodged, read, mapped],
      estimate: null,
      now,
    });
    expect(projection.exceptions[0]).toMatchObject({ type: "customs_hold" });
    expect(projection.exceptions[0]?.needsConfirmation).toBeUndefined();
    expect(view(ocean, [...lodged, read, mapped], null, now)).toMatchObject({
      verdict: "on_hold",
      hold: "customs",
      holds: [{ hold: "customs", since: at("2026-10-13 08:30") }],
    });
  });

  test("a hold mapped by a table is a fact from the start, and the operator's words stay out", () => {
    const road = roadShipment();
    const held = [
      confirmed(road, "PICKED_UP", at("2026-10-05 15:05")),
      hold(road, "carrier", "raised", at("2026-10-07 05:10"), {
        source: "EVS",
        remark: "1 package damaged at the platform",
      }),
    ];
    const customer = view(road, held, null, T0);
    expect(customer).toMatchObject({ verdict: "on_hold", hold: "carrier" });
    expect(JSON.stringify(customer)).not.toContain("damaged");
  });
});

describe("what never reaches the customer", () => {
  const road = roadShipment();
  const events: LoggedEvent[] = [
    confirmed(road, "PICKED_UP", at("2026-10-05 15:05")),
    confirmed(road, "HUB_IN", at("2026-10-05 18:30"), { place: VALENCIA }),
    confirmed(road, "HUB_OUT", at("2026-10-05 22:10"), { place: VALENCIA }),
    confirmed(road, "HUB_IN", at("2026-10-06 06:10"), { place: PERPIGNAN }),
    position(road, "Narbonne, FR", at("2026-10-06 09:00")),
    remark(road, "AVERÍA VEHÍCULO TRACTOR", at("2026-10-06 10:00"), { source: "EVS" }),
    operatorContacted(road, "EVS", at("2026-10-07 15:00")),
    documentOnFile(road, "cmr", at("2026-10-05 15:05")),
    documentOnFile(road, "export_declaration", at("2026-10-05 15:05"), false),
  ];
  const customer = view(road, events, estelaEstimate("2026-10-09"), T0);
  const serialised = JSON.stringify(customer);

  test("hub scans, positions, notes and our own actions are not in the view", () => {
    expect(customer.milestones.map((m) => m.code)).toEqual([
      "PICKED_UP",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]);
    expect(serialised).not.toContain("Narbonne");
    expect(serialised).not.toContain("AVERÍA");
    expect(serialised).not.toContain("Position and ETA");
  });

  test("raw message ids, sources and event keys are not in the view", () => {
    expect(serialised).not.toContain("raw:");
    expect(serialised).not.toContain("EVS");
    expect(serialised).not.toContain("eventKey");
  });

  test("exceptions, steps and clocks have no field to travel in", () => {
    expect(Object.keys(customer).sort()).toEqual(
      [
        "cargo",
        "committed",
        "consignee",
        "documents",
        "hold",
        "holds",
        "identifiers",
        "lastUpdateAt",
        "milestones",
        "notices",
        "orderRef",
        "originSiteId",
        "published",
        "reason",
        "route",
        "shipmentId",
        "stage",
        "verdict",
        "zone",
      ].sort(),
    );
  });

  test("a place is a name, a country and a zone: a port's code in the plan does not travel", () => {
    const coded = oceanShipment({
      consignee: { name: "Aquabajío", place: { ...QUERETARO, locode: "MXQRO" } },
    });
    expect(view(coded, [], null, T0).consignee.place).toEqual(QUERETARO);
  });

  test("only customer-visible documents are listed", () => {
    expect(customer.documents.map((document) => document.docType)).toEqual(["cmr"]);
  });

  test("tells how fresh the picture is without saying what the update was", () => {
    expect(customer.lastUpdateAt).toBe(at("2026-10-06 10:05"));
  });
});
