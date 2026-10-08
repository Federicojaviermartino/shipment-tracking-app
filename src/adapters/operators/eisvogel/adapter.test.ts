import { describe, expect, test } from "vitest";
import type { ParsedItem } from "@/domain/ingestion";
import type { RawMessage } from "@/domain/log";
import type { MilestoneCode, Place } from "@/domain/shipment";
import { instantAt } from "@/domain/time";
import { eisvogelAdapter } from "./adapter";
import { emitEisvogel } from "./emitter";
import { EISVOGEL_STATUS } from "./mapping";

const paris = (date: string, time: string) => instantAt(date, time, "Europe/Paris");
const PERPIGNAN: Place = { name: "Perpignan", country: "FR", zone: "Europe/Paris" };

function message(body: string): RawMessage {
  return {
    id: "raw-1",
    operatorId: "EVS",
    channel: "webhook",
    receivedAt: paris("2026-10-06", "06:11"),
    body,
  };
}

function items(payload: Record<string, unknown>): ParsedItem[] {
  const result = eisvogelAdapter.parse(message(JSON.stringify(payload)));
  if (!result.ok) throw new Error(`Quarantined: ${result.reason}`);
  return result.items;
}

const scan = {
  sendungsnr: "EVS-88104652",
  status: "400",
  statustext: "Umschlag Eingang",
  ort: "Perpignan, FR",
  zeit: "2026-10-06T06:10:00+02:00",
};

describe("Eisvogel: the mapping table", () => {
  test.each<[string, string, MilestoneCode]>([
    ["300", "Abgeholt", "PICKED_UP"],
    ["400", "Umschlag Eingang", "HUB_IN"],
    ["410", "Umschlag Ausgang", "HUB_OUT"],
    ["600", "In Zustellung", "OUT_FOR_DELIVERY"],
    ["700", "Zugestellt", "DELIVERED"],
  ])("%s %s is %s at the place named in ort", (status, statustext, milestone) => {
    expect(items({ ...scan, status, statustext })).toEqual([
      {
        kind: "observation",
        ref: { by: "reference", value: "EVS-88104652" },
        observation: { type: "milestone", code: milestone, place: PERPIGNAN },
        occurredAt: paris("2026-10-06", "06:10"),
        precision: "minute",
        rule: `eisvogel:${status} ${statustext}`,
      },
    ]);
  });

  test("510 Unterwegs is a position, with the place kept as the carrier wrote it", () => {
    const ping = {
      ...scan,
      status: "510",
      statustext: "Unterwegs",
      ort: "La Jonquera, ES",
      lat: 42.42,
      lon: 2.87,
    };
    expect(items(ping)).toEqual([
      expect.objectContaining({
        observation: { type: "position", place: "La Jonquera, ES" },
        rule: "eisvogel:510 Unterwegs",
      }),
    ]);
  });

  test("the tests above cover every row of the table", () => {
    expect(Object.keys(EISVOGEL_STATUS).sort()).toEqual(["300", "400", "410", "510", "600", "700"]);
  });

  test("any other code is a note, with status text and remark verbatim", () => {
    const refused = {
      ...scan,
      status: "420",
      statustext: "Nicht verladen",
      bemerkung: "nächste Abfahrt",
    };
    expect(items(refused)).toEqual([
      expect.objectContaining({
        observation: { type: "note", text: "Nicht verladen: nächste Abfahrt" },
        rule: "eisvogel:unmapped code",
      }),
    ]);
  });
});

describe("Eisvogel: what rides on a payload besides its status", () => {
  test("an eta yields an operator estimate for the delivery, to the minute", () => {
    const [, estimate] = items({ ...scan, eta: "2026-10-08T10:00:00+02:00" });
    expect(estimate).toEqual({
      kind: "observation",
      ref: { by: "reference", value: "EVS-88104652" },
      observation: {
        type: "estimate",
        code: "DELIVERED",
        at: paris("2026-10-08", "10:00"),
        precision: "minute",
      },
      occurredAt: paris("2026-10-06", "06:10"),
      precision: "minute",
      rule: "eisvogel:eta",
    });
  });

  test("the eta of a position is an estimate too", () => {
    const ping = {
      ...scan,
      status: "510",
      statustext: "Unterwegs",
      eta: "2026-10-08T11:00:00+02:00",
    };
    expect(items(ping).map((item) => item.kind === "observation" && item.observation.type)).toEqual(
      ["position", "estimate"],
    );
  });

  test("a delivery makes its own eta moot", () => {
    const delivered = {
      ...scan,
      status: "700",
      statustext: "Zugestellt",
      eta: "2026-10-08T10:00:00+02:00",
    };
    expect(items(delivered)).toHaveLength(1);
  });

  test("a remark on a known status is kept as a note", () => {
    const back = {
      ...scan,
      status: "510",
      statustext: "Unterwegs",
      bemerkung: "Telematik-Störung behoben",
    };
    expect(items(back)[1]).toMatchObject({
      observation: { type: "note", text: "Telematik-Störung behoben" },
    });
  });

  test("a place in a country Estela does not ship through is left for the plan to resolve", () => {
    const [swiss] = items({ ...scan, status: "700", statustext: "Zugestellt", ort: "Basel, CH" });
    expect(swiss).toMatchObject({ observation: { type: "milestone", code: "DELIVERED" } });
    expect(swiss?.kind === "observation" && "place" in swiss.observation).toBe(false);
  });

  test("reads the offset of each timestamp", () => {
    const [winter] = items({ ...scan, zeit: "2026-10-26T06:10:00+01:00" });
    expect(winter?.kind === "observation" && winter.occurredAt).toBe(Date.UTC(2026, 9, 26, 5, 10));
  });
});

describe("Eisvogel: malformed payloads", () => {
  test.each([
    ["text that is not JSON", "EVS-88104652;400;Umschlag Eingang"],
    ["a JSON array", "[]"],
    ["a missing reference", JSON.stringify({ ...scan, sendungsnr: undefined })],
    ["a status that is not three digits", JSON.stringify({ ...scan, status: "40" })],
    ["a time without an offset", JSON.stringify({ ...scan, zeit: "2026-10-06 06:10" })],
    ["an eta that is not a time", JSON.stringify({ ...scan, eta: "morgen" })],
    ["a missing place", JSON.stringify({ ...scan, ort: "" })],
    ["a number where text belongs", JSON.stringify({ ...scan, statustext: 400 })],
  ])("quarantines %s and never throws", (_, body) => {
    expect(eisvogelAdapter.parse(message(body))).toEqual({ ok: false, reason: expect.any(String) });
  });
});

describe("Eisvogel: emitter and adapter agree", () => {
  test("the emitter writes payloads exactly as Eisvogel does", () => {
    expect(
      emitEisvogel({
        sendungsnr: "EVS-88104652",
        observation: { type: "milestone", code: "HUB_IN", place: PERPIGNAN },
        occurredAt: paris("2026-10-06", "06:10"),
        eta: { at: paris("2026-10-08", "10:00"), zone: "Europe/Paris" },
      }),
    ).toBe(
      '{"sendungsnr":"EVS-88104652","status":"400","statustext":"Umschlag Eingang","ort":"Perpignan, FR","zeit":"2026-10-06T06:10:00+02:00","eta":"2026-10-08T10:00:00+02:00"}',
    );
    expect(
      emitEisvogel({
        sendungsnr: "EVS-88104588",
        observation: { type: "position", place: "La Jonquera, ES" },
        occurredAt: paris("2026-10-06", "13:00"),
        zone: "Europe/Madrid",
        coordinates: { lat: 42.42, lon: 2.87 },
        eta: { at: paris("2026-10-08", "11:00"), zone: "Europe/Berlin" },
      }),
    ).toBe(
      '{"sendungsnr":"EVS-88104588","status":"510","statustext":"Unterwegs","ort":"La Jonquera, ES","zeit":"2026-10-06T13:00:00+02:00","lat":42.42,"lon":2.87,"eta":"2026-10-08T11:00:00+02:00"}',
    );
  });

  test.each<[string, Parameters<typeof emitEisvogel>[0]["observation"]]>([
    [
      "a pickup",
      {
        type: "milestone",
        code: "PICKED_UP",
        place: { name: "Riba-roja de Túria", country: "ES", zone: "Europe/Madrid" },
      },
    ],
    ["a hub departure", { type: "milestone", code: "HUB_OUT", place: PERPIGNAN }],
    [
      "a delivery",
      {
        type: "milestone",
        code: "DELIVERED",
        place: { name: "Mannheim", country: "DE", zone: "Europe/Berlin" },
      },
    ],
    ["a position", { type: "position", place: "Nîmes, FR" }],
  ])("%s survives the round trip", (_, observation) => {
    const occurredAt = paris("2026-10-07", "15:35");
    const body = emitEisvogel({
      sendungsnr: "EVS-88104700",
      observation,
      occurredAt,
      zone: "Europe/Paris",
    });
    const result = eisvogelAdapter.parse(message(body));
    expect(result).toEqual({
      ok: true,
      items: [
        expect.objectContaining({
          ref: { by: "reference", value: "EVS-88104700" },
          observation,
          occurredAt,
        }),
      ],
    });
  });
});
