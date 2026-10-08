import { describe, expect, test } from "vitest";
import type { ParsedItem } from "@/domain/ingestion";
import type { RawMessage } from "@/domain/log";
import type { MilestoneCode, Place } from "@/domain/shipment";
import { dayInstant, instantAt } from "@/domain/time";
import { cierzoAdapter } from "./adapter";
import { emitCierzo } from "./emitter";
import { CIERZO_MILESTONES } from "./mapping";

const madrid = (date: string, time: string) => instantAt(date, time, "Europe/Madrid");
const spain = (name: string): Place => ({ name, country: "ES", zone: "Europe/Madrid" });

function message(body: string): RawMessage {
  return {
    id: "raw-1",
    operatorId: "CRZ",
    channel: "csv",
    receivedAt: madrid("2026-10-07", "14:00"),
    body,
  };
}

function items(body: string): ParsedItem[] {
  const result = cierzoAdapter.parse(message(body));
  if (!result.ok) throw new Error(`Quarantined: ${result.reason}`);
  return result.items;
}

describe("Cierzo: the mapping table", () => {
  test.each<[string, string, MilestoneCode]>([
    ["10", "RECOGIDA EFECTUADA", "PICKED_UP"],
    ["25", "LLEGADA A PLATAFORMA", "HUB_IN"],
    ["26", "SALIDA DE PLATAFORMA", "HUB_OUT"],
    ["30", "EN REPARTO", "OUT_FOR_DELIVERY"],
    ["40", "ENTREGADO", "DELIVERED"],
    ["60", "ENTRADA EN TERMINAL", "GATE_IN"],
  ])("%s %s is %s at the plaza", (code, text, milestone) => {
    expect(items(`CRZ-2290311;${code};${text};ZARAGOZA;21/09/2026 15:10;`)).toEqual([
      {
        kind: "observation",
        ref: { by: "reference", value: "CRZ-2290311" },
        observation: { type: "milestone", code: milestone, place: spain("Zaragoza") },
        occurredAt: madrid("2026-09-21", "15:10"),
        precision: "minute",
        rule: `cierzo:${code} ${text}`,
      },
    ]);
  });

  test("the test above covers every row of the table", () => {
    expect(Object.keys(CIERZO_MILESTONES).sort()).toEqual(["10", "25", "26", "30", "40", "60"]);
  });

  test("55 clears a carrier hold", () => {
    expect(items("CRZ-2291274;55;INCIDENCIA RESUELTA;MÁLAGA;07/10/2026 17:30;")).toMatchObject([
      { observation: { type: "hold", hold: "carrier", state: "cleared" } },
    ]);
  });

  test("any other code is a note with the status kept verbatim", () => {
    expect(items("CRZ-2290311;77;PENDIENTE DE CITA;SEVILLA;06/10/2026 09:00;LLAMAR ANTES")).toEqual(
      [
        expect.objectContaining({
          observation: { type: "note", text: "PENDIENTE DE CITA. LLAMAR ANTES" },
          rule: "cierzo:unmapped code",
        }),
      ],
    );
  });

  test("a remark on a delivery is kept next to the milestone", () => {
    const parsed = items(
      "CRZ-2291310;40;ENTREGADO;SEVILLA;07/10/2026 12:05;FIRMADO: ALMACÉN. SIN RESERVAS",
    );
    expect(parsed.map((item) => item.kind === "observation" && item.observation)).toEqual([
      { type: "milestone", code: "DELIVERED", place: spain("Sevilla") },
      { type: "note", text: "FIRMADO: ALMACÉN. SIN RESERVAS" },
    ]);
  });

  test("writes a plaza as a place name", () => {
    const place = (plaza: string) => {
      const [item] = items(`CRZ-1;10;RECOGIDA EFECTUADA;${plaza};05/10/2026 17:20;`);
      return item?.kind === "observation" && item.observation.type === "milestone"
        ? item.observation.place?.name
        : undefined;
    };
    expect(place("RIBA-ROJA DE TÚRIA")).toBe("Riba-roja de Túria");
    expect(place("ABADIÑO")).toBe("Abadiño");
    expect(place("EL EJIDO")).toBe("El Ejido");
  });
});

describe("Cierzo: what a 50 INCIDENCIA means depends on its remark", () => {
  test("goods held: a carrier hold, with a fixed English reason", () => {
    const line =
      "CRZ-2291274;50;INCIDENCIA;MÁLAGA;07/10/2026 05:10;1 BULTO DAÑADO EN PLATAFORMA. MERCANCÍA RETENIDA A LA ESPERA DE INSTRUCCIONES";
    expect(items(line)).toEqual([
      expect.objectContaining({
        observation: {
          type: "hold",
          hold: "carrier",
          state: "raised",
          reason: "1 package damaged at the platform; goods held awaiting instructions",
        },
        occurredAt: madrid("2026-10-07", "05:10"),
      }),
    ]);
  });

  test("goods held for any other reason: still a hold, with the generic reason", () => {
    expect(
      items("CRZ-1;50;INCIDENCIA;MURCIA;07/10/2026 05:10;MERCANCÍA RETENIDA POR IMPAGO"),
    ).toEqual([
      expect.objectContaining({
        observation: {
          type: "hold",
          hold: "carrier",
          state: "raised",
          reason: "Goods held by the carrier",
        },
      }),
    ]);
  });

  test("a new delivery date: a day-precision estimate for the delivery, wherever it was keyed", () => {
    expect(
      items("CRZ-2291188;50;INCIDENCIA;ZARAGOZA;06/10/2026 12:10;NUEVA ENTREGA PREVISTA 08/10"),
    ).toEqual([
      {
        kind: "observation",
        ref: { by: "reference", value: "CRZ-2291188" },
        observation: {
          type: "estimate",
          code: "DELIVERED",
          at: dayInstant("2026-10-08"),
          precision: "day",
        },
        occurredAt: madrid("2026-10-06", "12:10"),
        precision: "minute",
        rule: "cierzo:50 INCIDENCIA (new delivery date)",
      },
    ]);
  });

  test("a new delivery date in January, announced in December, is next year's", () => {
    const [item] = items(
      "CRZ-1;50;INCIDENCIA;ZARAGOZA;30/12/2026 12:10;NUEVA ENTREGA PREVISTA 02/01",
    );
    expect(item).toMatchObject({ observation: { at: dayInstant("2027-01-02") } });
  });

  test("anything else: a note with the remark kept verbatim", () => {
    const remark = "AVERÍA VEHÍCULO TRACTOR A-23. MERCANCÍA SIN DAÑOS";
    expect(items(`CRZ-2291188;50;INCIDENCIA;TERUEL;06/10/2026 02:50;${remark}`)).toEqual([
      expect.objectContaining({ observation: { type: "note", text: remark } }),
    ]);
  });
});

describe("Cierzo: wall-clock times without a zone", () => {
  test("are read as Madrid time on both sides of the daylight-saving change", () => {
    const occurredAt = (fecha: string) => {
      const [item] = items(`CRZ-1;10;RECOGIDA EFECTUADA;ZARAGOZA;${fecha};`);
      return item?.kind === "observation" && item.occurredAt !== undefined
        ? new Date(item.occurredAt).toISOString()
        : undefined;
    };
    expect(occurredAt("24/10/2026 15:10")).toBe("2026-10-24T13:10:00.000Z");
    expect(occurredAt("26/10/2026 15:10")).toBe("2026-10-26T14:10:00.000Z");
  });
});

describe("Cierzo: batch files", () => {
  test("reads every data row, with or without the header", () => {
    const body = [
      "expedicion;codigo;estado;plaza;fecha;observaciones",
      "CRZ-2290311;10;RECOGIDA EFECTUADA;ZARAGOZA;21/09/2026 15:10;",
      "CRZ-2290311;60;ENTRADA EN TERMINAL;VALENCIA;22/09/2026 08:25;",
      "",
    ].join("\r\n");
    expect(items(body)).toHaveLength(2);
  });

  test.each([
    ["an empty body", ""],
    ["only the header", "expedicion;codigo;estado;plaza;fecha;observaciones"],
    ["too few fields", "CRZ-2290311;10;RECOGIDA EFECTUADA;ZARAGOZA"],
    ["too many fields", "CRZ-2290311;10;RECOGIDA EFECTUADA;ZARAGOZA;21/09/2026 15:10;;;"],
    [
      "a reference that is not Cierzo's",
      "TGF-26-03412;10;RECOGIDA EFECTUADA;ZARAGOZA;21/09/2026 15:10;",
    ],
    [
      "a code that is not two digits",
      "CRZ-2290311;1O;RECOGIDA EFECTUADA;ZARAGOZA;21/09/2026 15:10;",
    ],
    ["an ISO date", "CRZ-2290311;10;RECOGIDA EFECTUADA;ZARAGOZA;2026-09-21T15:10:00+02:00;"],
    ["a day that does not exist", "CRZ-2290311;10;RECOGIDA EFECTUADA;ZARAGOZA;31/09/2026 15:10;"],
    ["no plaza", "CRZ-2290311;10;RECOGIDA EFECTUADA;;21/09/2026 15:10;"],
    ["something that is not a file at all", '{"sendungsnr":"EVS-1"}'],
  ])("quarantines %s and never throws", (_, body) => {
    const result = cierzoAdapter.parse(message(body));
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });
});

describe("Cierzo: emitter and adapter agree", () => {
  test("the emitter writes lines exactly as Cierzo does", () => {
    expect(
      emitCierzo({
        expedicion: "CRZ-2290311",
        observation: { type: "milestone", code: "PICKED_UP", place: spain("Zaragoza") },
        occurredAt: madrid("2026-09-21", "15:10"),
      }),
    ).toBe("CRZ-2290311;10;RECOGIDA EFECTUADA;ZARAGOZA;21/09/2026 15:10;");
    expect(
      emitCierzo({
        expedicion: "CRZ-2291188",
        observation: {
          type: "estimate",
          code: "DELIVERED",
          at: dayInstant("2026-10-08"),
          precision: "day",
        },
        occurredAt: madrid("2026-10-06", "12:10"),
        plaza: spain("Zaragoza"),
      }),
    ).toBe("CRZ-2291188;50;INCIDENCIA;ZARAGOZA;06/10/2026 12:10;NUEVA ENTREGA PREVISTA 08/10");
  });

  test.each<
    [string, Parameters<typeof emitCierzo>[0]["observation"], Place | undefined, string | undefined]
  >([
    [
      "a pickup",
      { type: "milestone", code: "PICKED_UP", place: spain("Abadiño") },
      undefined,
      undefined,
    ],
    [
      "a hub scan",
      { type: "milestone", code: "HUB_IN", place: spain("Málaga") },
      undefined,
      undefined,
    ],
    [
      "a gate-in",
      { type: "milestone", code: "GATE_IN", place: spain("Riba-roja de Túria") },
      undefined,
      undefined,
    ],
    [
      "a new delivery date",
      { type: "estimate", code: "DELIVERED", at: dayInstant("2026-10-08"), precision: "day" },
      spain("Zaragoza"),
      undefined,
    ],
    [
      "a hold",
      {
        type: "hold",
        hold: "carrier",
        state: "raised",
        reason: "2 packages damaged at the platform; goods held awaiting instructions",
      },
      spain("Málaga"),
      "2 BULTOS DAÑADOS EN PLATAFORMA. MERCANCÍA RETENIDA",
    ],
    [
      "a remark",
      { type: "note", text: "AVERÍA VEHÍCULO TRACTOR A-23" },
      spain("Teruel"),
      undefined,
    ],
  ])("%s survives the round trip", (_, observation, plaza, remark) => {
    const line = emitCierzo({
      expedicion: "CRZ-2291188",
      observation,
      occurredAt: madrid("2026-10-06", "12:10"),
      ...(plaza ? { plaza } : {}),
      ...(remark ? { remark } : {}),
    });
    expect(items(line)).toEqual([
      expect.objectContaining({
        ref: { by: "reference", value: "CRZ-2291188" },
        observation,
        occurredAt: madrid("2026-10-06", "12:10"),
      }),
    ]);
  });
});
