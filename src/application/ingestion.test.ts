import { describe, expect, test } from "vitest";
import { InMemoryEventStore } from "@/adapters/memory/in-memory-event-store";
import { OPERATOR_ADAPTERS } from "@/adapters/operators";
import { operatorEvents, type RawMessage } from "@/domain/log";
import { SEED, SHIPMENTS, T0 } from "@/fixtures";
import { createIngestion } from "./ingestion";
import type { TextInterpreter } from "./ports/text-interpreter";

const unreadable: TextInterpreter = { read: () => Promise.resolve(null) };

function start(interpreter: TextInterpreter = unreadable) {
  const store = new InMemoryEventStore();
  const ingestion = createIngestion({
    shipments: SHIPMENTS,
    adapters: OPERATOR_ADAPTERS,
    interpreter,
    store,
  });
  return { store, ingestion };
}

function raw(overrides: Partial<RawMessage> & Pick<RawMessage, "operatorId" | "body">): RawMessage {
  return { id: "raw-1", channel: "csv", receivedAt: T0, ...overrides };
}

const VESSEL_ARRIVED = JSON.stringify({
  eventType: "TRANSPORT",
  transportEventTypeCode: "ARRI",
  eventClassifierCode: "ACT",
  eventDateTime: "2026-10-09T06:10:00-06:00",
  UNLocationCode: "MXVER",
  vesselName: "NORAY ALTAIR",
  carrierVoyageNumber: "612W",
});

const EMAIL = [
  "Asunto: Exp. TGF-26-03412 / OC 12345",
  "La mercancía queda retenida en aduana.",
].join("\n");

describe("the seed", () => {
  test("every operator message is parsed from raw text, and none is left unprocessed", async () => {
    const { store, ingestion } = start();
    await ingestion.seed({ own: SEED.own, messages: SEED.messages });
    expect(store.unprocessed()).toEqual([]);
    for (const message of [...SEED.messages, ...SEED.own.raws]) {
      expect(store.raw(message.id)).toEqual(message);
    }
    expect(store.events().length).toBeGreaterThan(SEED.messages.length);
  });

  test("seeding announces nothing: there is nobody to tell at start-up", async () => {
    const { store, ingestion } = start();
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    await ingestion.seed({ own: SEED.own, messages: SEED.messages });
    expect(notified).toBe(0);
  });
});

describe("a live message", () => {
  test("a vessel event names no shipment and fans out to every one aboard, sharing its raw message", async () => {
    const { store, ingestion } = start();
    await ingestion.ingest([raw({ operatorId: "NRY", channel: "api", body: VESSEL_ARRIVED })]);
    const events = operatorEvents(store.events());
    expect(events.map((event) => event.shipmentId).sort()).toEqual(["EST-4058", "EST-4063"]);
    expect(new Set(events.map((event) => event.rawId))).toEqual(new Set(["raw-1"]));
    expect(events[0]).toMatchObject({
      fact: { type: "milestone", code: "VESSEL_ARRIVED" },
      reading: { method: "table" },
    });
  });

  test("the same message delivered twice changes nothing the second time", async () => {
    const { store, ingestion } = start();
    const message = raw({ operatorId: "NRY", channel: "api", body: VESSEL_ARRIVED });
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    await ingestion.ingest([message]);
    const logged = store.events();
    await ingestion.ingest([message]);
    expect(store.events()).toBe(logged);
    expect(notified).toBe(1);
  });

  test("messages that arrive together are appended together: one change, not one per message", async () => {
    const { store, ingestion } = start();
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    const header = "expediente;ref_cliente;concepto;estado;fecha;observaciones";
    await ingestion.ingest([
      raw({
        id: "raw-1",
        operatorId: "TGF",
        channel: "report",
        body: `${header}\nTGF-26-03412;12345;ENTREGA;ETA;16/10/2026;`,
      }),
      raw({
        id: "raw-2",
        operatorId: "TGF",
        channel: "report",
        body: `${header}\nTGF-26-03418;48221;ENTREGA;ETA;16/10/2026;`,
      }),
    ]);
    expect(notified).toBe(1);
    expect(store.events().map((event) => event.shipmentId)).toEqual(["EST-4058", "EST-4063"]);
  });

  test("free text is handed to the interpreter and logged as an AI reading, never as a table fact", async () => {
    const asked: string[] = [];
    const { store, ingestion } = start({
      read: ({ text }) => {
        asked.push(text);
        return Promise.resolve({
          observation: { type: "hold", hold: "customs", state: "raised", reason: "Held." },
          rule: "test:hold",
        });
      },
    });
    await ingestion.ingest([raw({ operatorId: "TGF", channel: "email", body: EMAIL })]);
    expect(asked).toEqual([EMAIL]);
    expect(operatorEvents(store.events())).toMatchObject([
      {
        shipmentId: "EST-4058",
        fact: { type: "hold", hold: "customs", state: "raised" },
        reading: { method: "ai", rule: "test:hold" },
        occurredAt: T0,
      },
    ]);
  });

  test("text the interpreter cannot read is kept as a note that points to the original", async () => {
    const { store, ingestion } = start(unreadable);
    await ingestion.ingest([raw({ operatorId: "TGF", channel: "email", body: EMAIL })]);
    expect(operatorEvents(store.events())).toMatchObject([
      { fact: { type: "note" }, reading: { method: "table" }, rawId: "raw-1" },
    ]);
    expect(store.raw("raw-1")?.body).toBe(EMAIL);
  });

  test("a malformed payload is quarantined: kept verbatim, with the reason, and nothing derived", async () => {
    const { store, ingestion } = start();
    await ingestion.ingest([raw({ operatorId: "NRY", channel: "api", body: "{not json" })]);
    expect(store.events()).toEqual([]);
    expect(store.unprocessed()).toEqual([
      { rawId: "raw-1", reason: "quarantined", detail: "not JSON" },
    ]);
    expect(store.raw("raw-1")?.body).toBe("{not json");
  });

  test("a message from an operator nobody has an adapter for is quarantined too", async () => {
    const { store, ingestion } = start();
    await ingestion.ingest([raw({ operatorId: "XXX", body: "hello" })]);
    expect(store.unprocessed()).toMatchObject([{ reason: "quarantined" }]);
  });

  test("a reference that matches no shipment never attaches by guess", async () => {
    const { store, ingestion } = start();
    const body = "CRZ-0000000;40;ENTREGADO;SEVILLA;07/10/2026 12:05;";
    await ingestion.ingest([raw({ operatorId: "CRZ", body })]);
    expect(store.events()).toEqual([]);
    expect(store.unprocessed()).toEqual([
      { rawId: "raw-1", reason: "orphan", detail: "1 item matched no shipment" },
    ]);
  });
});
