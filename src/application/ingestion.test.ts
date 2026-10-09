import { describe, expect, test } from "vitest";
import { InMemoryEventStore } from "@/adapters/memory/in-memory-event-store";
import { ScriptedDemoFeed } from "@/adapters/memory/scripted-demo-feed";
import { OPERATOR_ADAPTERS } from "@/adapters/operators";
import { startEstela } from "@/composition/test-support";
import { operatorEvents, type RawMessage } from "@/domain/log";
import { HOUR } from "@/domain/time";
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

describe("a file with several rows", () => {
  const HEADER = "expedicion;codigo;estado;plaza;fecha;observaciones";
  /** EST-4141, from the Abadiño plant. */
  const BIO_ROW = "CRZ-2291402;26;SALIDA DE PLATAFORMA;BILBAO;07/10/2026 15:10;";
  /** EST-4122, from the Zaragoza plant. */
  const ZAZ_ROW = "CRZ-2291502;25;LLEGADA A PLATAFORMA;VALENCIA;07/10/2026 15:40;";
  const file = (...lines: string[]) => raw({ operatorId: "CRZ", body: lines.join("\n") });

  test("is kept as one message per row, each under the header of its file", async () => {
    const { store, ingestion } = start();
    await ingestion.ingest([file(HEADER, BIO_ROW, "", ZAZ_ROW)]);
    expect(store.raw("raw-1#1")).toEqual({
      ...file(),
      id: "raw-1#1",
      body: `${HEADER}\n${BIO_ROW}`,
    });
    expect(store.raw("raw-1#2")).toEqual({
      ...file(),
      id: "raw-1#2",
      body: `${HEADER}\n${ZAZ_ROW}`,
    });
    expect(operatorEvents(store.events()).map((event) => [event.shipmentId, event.rawId])).toEqual([
      ["EST-4141", "raw-1#1"],
      ["EST-4122", "raw-1#2"],
    ]);
  });

  test("a file without a header is cut the same way, and its rows stay as they came", async () => {
    const { store, ingestion } = start();
    await ingestion.ingest([file(BIO_ROW, ZAZ_ROW)]);
    expect([store.raw("raw-1#1")?.body, store.raw("raw-1#2")?.body]).toEqual([BIO_ROW, ZAZ_ROW]);
  });

  test("a Turia report is cut by row too, an email never", async () => {
    const { store, ingestion } = start();
    const header = "expediente;ref_cliente;concepto;estado;fecha;observaciones";
    const rows = [
      "TGF-26-03412;12345;ENTREGA;ETA;16/10/2026;",
      "TGF-26-03418;48221;ENTREGA;ETA;16/10/2026;",
    ];
    await ingestion.ingest([
      raw({ operatorId: "TGF", channel: "report", body: [header, ...rows].join("\n") }),
      raw({ id: "raw-2", operatorId: "TGF", channel: "email", body: EMAIL }),
    ]);
    expect(operatorEvents(store.events()).map((event) => [event.shipmentId, event.rawId])).toEqual([
      ["EST-4058", "raw-1#1"],
      ["EST-4063", "raw-1#2"],
      ["EST-4058", "raw-2"],
    ]);
    expect(store.raw("raw-1#2")?.body).toBe(`${header}\n${rows[1]}`);
    expect(store.raw("raw-2")?.body).toBe(EMAIL);
  });

  test("the original shown under a shipment never carries another shipment's row", async () => {
    const { estela, iker, receive } = await startEstela();
    await receive(file(HEADER, BIO_ROW, ZAZ_ROW));
    // Iker's perimeter is the Abadiño plant: EST-4122 does not exist for him.
    expect(await estela.ops.shipment(iker, "EST-4122")).toBeNull();
    const page = JSON.stringify(await estela.ops.shipment(iker, "EST-4141"));
    expect(page).toContain(JSON.stringify(`${HEADER}\n${BIO_ROW}`));
    expect(page).not.toContain("CRZ-2291502");
  });

  test("one unreadable row costs only itself", async () => {
    const { store, ingestion } = start();
    const unreadableRow = "CRZ-2291502;25;LLEGADA A PLATAFORMA;VALENCIA;07/10/2026 5:40;";
    await ingestion.ingest([file(HEADER, BIO_ROW, unreadableRow)]);
    expect(operatorEvents(store.events())).toMatchObject([
      { shipmentId: "EST-4141", fact: { type: "milestone", code: "HUB_OUT" } },
    ]);
    expect(store.unprocessed()).toMatchObject([{ rawId: "raw-1#2", reason: "quarantined" }]);
    expect(store.raw("raw-1#2")?.body).toBe(`${HEADER}\n${unreadableRow}`);
  });

  test("the same file delivered twice changes nothing the second time", async () => {
    const { store, ingestion } = start();
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    const orphan = "CRZ-0000000;40;ENTREGADO;SEVILLA;07/10/2026 12:05;";
    await ingestion.ingest([file(HEADER, BIO_ROW, ZAZ_ROW, orphan)]);
    const logged = store.events();
    await ingestion.ingest([file(HEADER, BIO_ROW, ZAZ_ROW, orphan)]);
    expect(store.events()).toBe(logged);
    expect(logged).toHaveLength(2);
    expect(store.unprocessed()).toEqual([
      { rawId: "raw-1#3", reason: "orphan", detail: "1 item matched no shipment" },
    ]);
    expect(notified).toBe(1);
  });

  test("the scripted feed reads its event as sent, though the file is kept under the ids of its rows", async () => {
    const { store, ingestion } = start();
    const feed = new ScriptedDemoFeed([
      {
        id: "X",
        label: "Transportes Cierzo · two scans in one file",
        precondition: { kind: "none" },
        messageIds: ["raw-1"],
        messages: () => [file(HEADER, BIO_ROW, ZAZ_ROW)],
      },
    ]);
    const log = { events: () => store.events(), received: ingestion.received };
    expect(feed.events(log)).toMatchObject([{ id: "X", state: "ready" }]);
    await ingestion.ingest(feed.messages("X", T0));
    expect(store.raw("raw-1")).toBeUndefined();
    expect(feed.events(log)).toMatchObject([{ id: "X", state: "sent" }]);
  });

  test("a message that already holds one row is its own original and keeps its id", async () => {
    const { store, ingestion } = start();
    await ingestion.ingest([file(HEADER, BIO_ROW)]);
    expect(store.raw("raw-1")).toEqual(file(HEADER, BIO_ROW));
    expect(operatorEvents(store.events()).map((event) => event.rawId)).toEqual(["raw-1"]);
  });
});

describe("a vessel event counts only at the right end of the voyage", () => {
  const vessel = (
    code: "ARRI" | "DEPA",
    port: string,
    time: string,
    name: string,
    voyage: string,
  ) =>
    JSON.stringify({
      eventType: "TRANSPORT",
      transportEventTypeCode: code,
      eventClassifierCode: "ACT",
      eventDateTime: time,
      UNLocationCode: port,
      vesselName: name,
      carrierVoyageNumber: voyage,
    });

  test("NORAY DENEB berthing in Valencia to load leaves her boxes where they are", async () => {
    // Wed 7 Oct 22:30 in Madrid, twenty minutes after she berths.
    const { estela, marta, receive } = await startEstela({ at: T0 + 6.5 * HOUR });
    const body = vessel("ARRI", "ESVLC", "2026-10-07T22:10:00+02:00", "NORAY DENEB", "614W");
    await receive({ operatorId: "NRY", channel: "api", body });
    expect((await estela.ops.shipment(marta, "EST-4116"))?.stage.code).toBe("at_origin_port");
    expect((await estela.ops.shipment(marta, "EST-4122"))?.stage.code).toBe("in_transit");
  });

  test("NORAY CASTOR sailing from Veracruz does not put the boxes she discharged back at sea", async () => {
    const { estela, marta, receive } = await startEstela();
    const body = vessel("DEPA", "MXVER", "2026-10-04T18:00:00-06:00", "NORAY CASTOR", "611W");
    await receive({ operatorId: "NRY", channel: "api", body });
    expect((await estela.ops.shipment(marta, "EST-4012"))?.stage.code).toBe("at_destination_port");
    expect((await estela.ops.shipment(marta, "EST-4033"))?.stage.code).toBe("at_destination_port");
  });
});
