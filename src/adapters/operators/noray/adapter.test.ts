import { describe, expect, test } from "vitest";
import type { ParsedItem } from "@/domain/ingestion";
import type { RawMessage } from "@/domain/log";
import type { MilestoneCode } from "@/domain/shipment";
import { instantAt } from "@/domain/time";
import { norayAdapter } from "./adapter";
import { emitNoray } from "./emitter";
import { NORAY_EQUIPMENT, NORAY_PORTS, NORAY_TRANSPORT } from "./mapping";

const VALENCIA = NORAY_PORTS.ESVLC?.place;
const VERACRUZ = NORAY_PORTS.MXVER?.place;
if (!VALENCIA || !VERACRUZ) throw new Error("The port table lost a port");

const receivedAt = instantAt("2026-10-05", "07:00", "Europe/Madrid");

function message(body: string): RawMessage {
  return { id: "raw-1", operatorId: "NRY", channel: "api", receivedAt, body };
}

function items(event: Record<string, unknown>): ParsedItem[] {
  const result = norayAdapter.parse(message(JSON.stringify(event)));
  if (!result.ok) throw new Error(`Quarantined: ${result.reason}`);
  return result.items;
}

const gateIn = {
  eventType: "EQUIPMENT",
  equipmentEventTypeCode: "GTIN",
  eventClassifierCode: "ACT",
  emptyIndicatorCode: "LADEN",
  eventDateTime: "2026-09-22T08:31:00+02:00",
  UNLocationCode: "ESVLC",
  equipmentReference: "NRYU4821373",
};

const arrival = {
  eventType: "TRANSPORT",
  transportEventTypeCode: "ARRI",
  eventClassifierCode: "EST",
  eventDateTime: "2026-10-09T06:00:00-06:00",
  UNLocationCode: "MXVER",
  vesselName: "NORAY ALTAIR",
  carrierVoyageNumber: "612W",
};

describe("Noray: equipment events are keyed on code, laden and facility", () => {
  test.each<[string, string, MilestoneCode]>([
    ["GTIN", "ESVLC", "GATE_IN"],
    ["LOAD", "ESVLC", "LOADED"],
    ["DISC", "MXVER", "DISCHARGED"],
    ["GTOT", "MXVER", "GATE_OUT"],
  ])("a laden %s at %s is %s", (code, locode, milestone) => {
    const [item] = items({ ...gateIn, equipmentEventTypeCode: code, UNLocationCode: locode });
    expect(item).toEqual({
      kind: "observation",
      ref: { by: "reference", value: "NRYU4821373" },
      observation: { type: "milestone", code: milestone, place: NORAY_PORTS[locode]?.place },
      occurredAt: Date.parse("2026-09-22T08:31:00+02:00"),
      precision: "minute",
      rule: expect.stringContaining(code),
    });
  });

  test("the test above covers every row of the equipment table", () => {
    expect(NORAY_EQUIPMENT.map((row) => row.code)).toEqual(["GTIN", "LOAD", "DISC", "GTOT"]);
  });

  test("a laden gate-in at the destination is not our gate-in: it is kept as a note", () => {
    expect(items({ ...gateIn, UNLocationCode: "MXVER" })).toEqual([
      expect.objectContaining({
        observation: { type: "note", text: "Equipment event GTIN ACT LADEN at MXVER" },
      }),
    ]);
  });

  test("a laden gate-out at the origin is not our gate-out either", () => {
    const [item] = items({ ...gateIn, equipmentEventTypeCode: "GTOT" });
    expect(item).toMatchObject({ observation: { type: "note" } });
  });

  test("empty moves are ignored", () => {
    expect(items({ ...gateIn, emptyIndicatorCode: "EMPTY" })).toEqual([]);
    expect(
      items({ ...gateIn, equipmentEventTypeCode: "GTOT", emptyIndicatorCode: "EMPTY" }),
    ).toEqual([]);
  });

  test("planned events are ignored: only what happened is a milestone", () => {
    expect(items({ ...gateIn, eventClassifierCode: "PLN" })).toEqual([]);
    expect(items({ ...arrival, eventClassifierCode: "PLN" })).toEqual([]);
  });

  test("an unknown code or an unknown port is kept as a note", () => {
    expect(items({ ...gateIn, equipmentEventTypeCode: "STUF" })[0]).toMatchObject({
      observation: { type: "note" },
    });
    expect(items({ ...gateIn, UNLocationCode: "ESALG" })[0]).toMatchObject({
      observation: { type: "note" },
    });
  });
});

describe("Noray: transport events are about the vessel", () => {
  test("carry vessel and voyage, not a container", () => {
    const [item] = items(arrival);
    expect(item?.ref).toEqual({ by: "voyage", vessel: "NORAY ALTAIR", voyage: "612W" });
  });

  test("ARRI with EST is an estimate of the arrival, said when it was received", () => {
    expect(items(arrival)).toEqual([
      {
        kind: "observation",
        ref: { by: "voyage", vessel: "NORAY ALTAIR", voyage: "612W" },
        observation: {
          type: "estimate",
          code: "VESSEL_ARRIVED",
          place: VERACRUZ,
          at: instantAt("2026-10-09", "06:00", "America/Mexico_City"),
          precision: "minute",
        },
        rule: "noray:TRANSPORT ARRI EST",
      },
    ]);
  });

  test("ARRI with ACT is the arrival itself", () => {
    const berthed = {
      ...arrival,
      eventClassifierCode: "ACT",
      eventDateTime: "2026-10-02T05:40:00-06:00",
    };
    expect(items(berthed)).toEqual([
      expect.objectContaining({
        observation: { type: "milestone", code: "VESSEL_ARRIVED", place: VERACRUZ },
        occurredAt: instantAt("2026-10-02", "05:40", "America/Mexico_City"),
        rule: "noray:TRANSPORT ARRI ACT",
      }),
    ]);
  });

  test("DEPA with ACT is the departure", () => {
    const sailed = {
      ...arrival,
      transportEventTypeCode: "DEPA",
      eventClassifierCode: "ACT",
      eventDateTime: "2026-09-25T21:40:00+02:00",
      UNLocationCode: "ESVLC",
    };
    expect(items(sailed)[0]).toMatchObject({
      observation: { type: "milestone", code: "VESSEL_DEPARTED", place: VALENCIA },
    });
  });

  test("the tests above cover every row of the transport table", () => {
    expect(NORAY_TRANSPORT.map((row) => `${row.code} ${row.classifier}`)).toEqual([
      "DEPA ACT",
      "ARRI ACT",
      "ARRI EST",
    ]);
  });

  test("keeps the delay reason and the change remark with the estimate", () => {
    const delayed = {
      ...arrival,
      eventDateTime: "2026-10-11T08:00:00-06:00",
      delayReasonCode: "WEA",
      changeRemark: "Port closed to navigation by harbour master",
    };
    expect(items(delayed)[0]).toMatchObject({
      observation: {
        type: "estimate",
        at: instantAt("2026-10-11", "08:00", "America/Mexico_City"),
        remark: "WEA: Port closed to navigation by harbour master",
      },
    });
  });

  test("an estimated departure is not in the table: a note", () => {
    const [item] = items({ ...arrival, transportEventTypeCode: "DEPA" });
    expect(item).toMatchObject({
      observation: { type: "note", text: "Transport event DEPA EST at MXVER" },
    });
  });
});

describe("Noray: malformed payloads", () => {
  test.each([
    ["text that is not JSON", "GTIN ACT LADEN ESVLC NRYU4821373"],
    ["an unknown event type", JSON.stringify({ ...gateIn, eventType: "SHIPMENT" })],
    [
      "an equipment event without a container",
      JSON.stringify({ ...gateIn, equipmentReference: undefined }),
    ],
    [
      "an equipment event that does not say laden or empty",
      JSON.stringify({ ...gateIn, emptyIndicatorCode: undefined }),
    ],
    [
      "a transport event without a voyage",
      JSON.stringify({ ...arrival, carrierVoyageNumber: undefined }),
    ],
    ["an unknown classifier", JSON.stringify({ ...arrival, eventClassifierCode: "REQ" })],
    [
      "a location that is not a UN/LOCODE",
      JSON.stringify({ ...arrival, UNLocationCode: "Veracruz" }),
    ],
    ["a time that is not a time", JSON.stringify({ ...arrival, eventDateTime: "next Friday" })],
  ])("quarantines %s and never throws", (_, body) => {
    expect(norayAdapter.parse(message(body))).toEqual({ ok: false, reason: expect.any(String) });
  });
});

describe("Noray: emitter and adapter agree", () => {
  test("the emitter writes events exactly as Noray does", () => {
    expect(
      emitNoray({
        observation: { type: "milestone", code: "GATE_IN", place: VALENCIA },
        occurredAt: instantAt("2026-09-22", "08:31", "Europe/Madrid"),
        container: "NRYU4821373",
      }),
    ).toBe(JSON.stringify(gateIn));
    expect(
      emitNoray({
        observation: {
          type: "estimate",
          code: "VESSEL_ARRIVED",
          place: VERACRUZ,
          at: instantAt("2026-10-09", "06:00", "America/Mexico_City"),
          precision: "minute",
        },
        voyage: { vessel: "NORAY ALTAIR", voyage: "612W" },
      }),
    ).toBe(JSON.stringify(arrival));
  });

  test.each<[string, MilestoneCode, "container" | "voyage"]>([
    ["a loading", "LOADED", "container"],
    ["a discharge", "DISCHARGED", "container"],
    ["a gate-out", "GATE_OUT", "container"],
    ["a departure", "VESSEL_DEPARTED", "voyage"],
    ["an arrival", "VESSEL_ARRIVED", "voyage"],
  ])("%s survives the round trip", (_, code, about) => {
    const place = code === "LOADED" || code === "VESSEL_DEPARTED" ? VALENCIA : VERACRUZ;
    const occurredAt = instantAt("2026-10-03", "09:15", place.zone);
    const body = emitNoray({
      observation: { type: "milestone", code, place },
      occurredAt,
      ...(about === "container"
        ? { container: "NRYU3055186" }
        : { voyage: { vessel: "NORAY CASTOR", voyage: "611W" } }),
    });
    expect(norayAdapter.parse(message(body))).toEqual({
      ok: true,
      items: [
        expect.objectContaining({
          ref:
            about === "container"
              ? { by: "reference", value: "NRYU3055186" }
              : { by: "voyage", vessel: "NORAY CASTOR", voyage: "611W" },
          observation: { type: "milestone", code, place },
          occurredAt,
        }),
      ],
    });
  });
});
