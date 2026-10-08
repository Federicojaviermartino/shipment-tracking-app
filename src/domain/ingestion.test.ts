import { describe, expect, test } from "vitest";
import { correlate, ingestItems, toLoggedEvent, type ParsedItem } from "./ingestion";
import type { Reading } from "./log";
import { at, day, MEXICO, oceanShipment, PERPIGNAN, roadShipment, VERACRUZ } from "./test-support";

const order12345 = oceanShipment({ id: "EST-4058" });
const sameVessel = oceanShipment({
  id: "EST-4063",
  refs: [{ operatorId: "TGF", kind: "forwarder_file", value: "TGF-26-00002" }],
});
const otherVessel = oceanShipment({
  id: "EST-4012",
  refs: [],
  voyage: { vessel: "NORAY CASTOR", voyage: "611W" },
});
const road = roadShipment();
const shipments = [order12345, sameVessel, otherVessel, road];

const table: Reading = { method: "table", rule: "test" };
const raw = { id: "raw-1", operatorId: "NRY", receivedAt: at("2026-10-07 16:05") };

describe("correlation", () => {
  test("a reference attaches to the shipment that holds it from that operator", () => {
    const found = correlate(shipments, "TGF", { by: "reference", value: "TGF-26-00001" });
    expect(found.map((shipment) => shipment.id)).toEqual(["EST-4058"]);
  });

  test("the same value from another operator attaches to nothing", () => {
    expect(correlate(shipments, "CRZ", { by: "reference", value: "TGF-26-00001" })).toEqual([]);
  });

  test("an unknown reference attaches to nothing: never by guess", () => {
    expect(correlate(shipments, "TGF", { by: "reference", value: "TGF-26-99999" })).toEqual([]);
  });

  test("a vessel event fans out to every shipment aboard that voyage", () => {
    const aboard = correlate(shipments, "NRY", {
      by: "voyage",
      vessel: "Noray Altair",
      voyage: "612W",
    });
    expect(aboard.map((shipment) => shipment.id)).toEqual(["EST-4058", "EST-4063"]);
  });

  test("the same vessel on another voyage is another sailing", () => {
    expect(
      correlate(shipments, "NRY", { by: "voyage", vessel: "NORAY ALTAIR", voyage: "613W" }),
    ).toEqual([]);
  });
});

describe("from parsed items to logged events", () => {
  const arrival: ParsedItem = {
    kind: "observation",
    ref: { by: "voyage", vessel: "NORAY ALTAIR", voyage: "612W" },
    observation: {
      type: "estimate",
      code: "VESSEL_ARRIVED",
      place: VERACRUZ,
      at: at("2026-10-11 08:00", MEXICO),
      precision: "minute",
    },
    rule: "noray:TRANSPORT ARRI EST",
  };

  test("a vessel event becomes one event per shipment aboard, sharing the raw message", () => {
    const { events, orphans } = ingestItems(shipments, raw, [arrival]);
    expect(orphans).toEqual([]);
    expect(events.map((event) => [event.shipmentId, event.rawId])).toEqual([
      ["EST-4058", "raw-1"],
      ["EST-4063", "raw-1"],
    ]);
    const keys = events.map((event) => (event.kind === "operator" ? event.key : event.id));
    expect(new Set(keys).size).toBe(2);
  });

  test("an item that names no time takes the time of receipt", () => {
    const [event] = ingestItems(shipments, raw, [arrival]).events;
    expect(event).toMatchObject({
      kind: "operator",
      occurredAt: raw.receivedAt,
      receivedAt: raw.receivedAt,
      precision: "minute",
      reading: { method: "table", rule: "noray:TRANSPORT ARRI EST" },
    });
  });

  test("an unmatched reference is kept apart as an orphan", () => {
    const stray: ParsedItem = {
      kind: "observation",
      ref: { by: "reference", value: "NRYU0000000" },
      observation: { type: "milestone", code: "LOADED" },
      occurredAt: at("2026-09-25 03:10"),
      rule: "noray:EQUIPMENT LOAD",
    };
    const result = ingestItems(shipments, raw, [stray]);
    expect(result.events).toEqual([]);
    expect(result.orphans).toEqual([stray]);
  });

  test("free text is handed over unread, tied to its shipment", () => {
    const email: ParsedItem = {
      kind: "free_text",
      ref: { by: "reference", value: "TGF-26-00001" },
      text: "La mercancía queda retenida",
    };
    const result = ingestItems(shipments, { ...raw, operatorId: "TGF" }, [email]);
    expect(result.events).toEqual([]);
    expect(result.unread).toEqual([
      { shipment: order12345, ref: email.ref, text: "La mercancía queda retenida" },
    ]);
  });
});

describe("idempotency keys", () => {
  const delivered = (occurredAt: number, receivedAt = at("2026-10-15 08:30")) =>
    toLoggedEvent({
      shipment: order12345,
      raw: { id: `raw-${receivedAt}`, operatorId: "TGF", receivedAt },
      ref: { by: "reference", value: "TGF-26-00001" },
      observation: { type: "milestone", code: "DELIVERED" },
      occurredAt,
      precision: "day",
      reading: table,
    });
  const key = (event: ReturnType<typeof toLoggedEvent>) =>
    event.kind === "operator" ? event.key : event.id;

  test("the same message delivered again yields the same key", () => {
    const first = delivered(day("2026-10-14"));
    const again = delivered(day("2026-10-14"), at("2026-10-15 10:30"));
    expect(key(again)).toBe(key(first));
  });

  test("the same milestone at another time is another event: a correction", () => {
    expect(key(delivered(day("2026-10-15")))).not.toBe(key(delivered(day("2026-10-14"))));
  });
});

describe("which milestone an operator means", () => {
  const record = (observation: Parameters<typeof toLoggedEvent>[0]["observation"]) =>
    toLoggedEvent({
      shipment: road,
      raw: { id: "raw-2", operatorId: "EVS", receivedAt: at("2026-10-06 06:11") },
      ref: { by: "reference", value: "EVS-1" },
      observation,
      occurredAt: at("2026-10-06 06:10"),
      precision: "minute",
      reading: table,
    });

  test("a stated place is matched to the plan whatever the capitals and accents", () => {
    const shouted = { ...PERPIGNAN, name: "PERPIGNAN" };
    expect(record({ type: "milestone", code: "HUB_IN", place: shouted })).toMatchObject({
      fact: { type: "milestone", code: "HUB_IN", place: PERPIGNAN },
    });
  });

  test("a stated place outside the plan is a fact at that place: an unplanned stop", () => {
    const narbonne = { ...PERPIGNAN, name: "Narbonne" };
    expect(record({ type: "milestone", code: "HUB_IN", place: narbonne })).toMatchObject({
      fact: { type: "milestone", code: "HUB_IN", place: narbonne },
    });
  });

  test("without a place, the plan answers when it has that milestone exactly once", () => {
    expect(record({ type: "milestone", code: "DELIVERED" })).toMatchObject({
      fact: { type: "milestone", code: "DELIVERED", place: { name: "Saint-Priest" } },
    });
  });

  test("without a place and with two candidates, nothing is guessed: it is kept as a note", () => {
    expect(record({ type: "milestone", code: "HUB_IN" })).toMatchObject({
      fact: { type: "note" },
    });
  });

  test("an estimate for a milestone the plan does not have is kept as a note", () => {
    const estimate = record({
      type: "estimate",
      code: "VESSEL_ARRIVED",
      at: at("2026-10-09 06:00"),
      precision: "minute",
    });
    expect(estimate).toMatchObject({ fact: { type: "note" } });
  });

  test("a document announced by an operator becomes a document on file", () => {
    const event = toLoggedEvent({
      shipment: order12345,
      raw: { id: "raw-3", operatorId: "TGF", receivedAt: at("2026-09-29 08:30") },
      ref: { by: "reference", value: "TGF-26-00001" },
      observation: { type: "document", docType: "bill_of_lading" },
      occurredAt: day("2026-09-28"),
      precision: "day",
      reading: table,
    });
    expect(event).toMatchObject({
      kind: "document",
      shipmentId: "EST-4058",
      source: "TGF",
      rawId: "raw-3",
      docType: "bill_of_lading",
      fileName: "bill-of-lading-70001.pdf",
      customerVisible: true,
    });
  });
});
