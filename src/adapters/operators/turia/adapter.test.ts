import { describe, expect, test } from "vitest";
import type { Observation, ParsedItem } from "@/domain/ingestion";
import type { Channel, RawMessage } from "@/domain/log";
import { dayInstant, instantAt } from "@/domain/time";
import { turiaAdapter } from "./adapter";
import { emitTuriaRow } from "./emitter";
import { TURIA_HEADER, TURIA_REPORT } from "./mapping";

const receivedAt = instantAt("2026-10-06", "08:30", "Europe/Madrid");

function message(body: string, channel: Channel = "report"): RawMessage {
  return { id: "raw-1", operatorId: "TGF", channel, receivedAt, body };
}

/** A report row under its header, as each message arrives. */
function items(row: string): ParsedItem[] {
  const result = turiaAdapter.parse(message(`${TURIA_HEADER}\n${row}`));
  if (!result.ok) throw new Error(`Quarantined: ${result.reason}`);
  return result.items;
}

const observations = (row: string) =>
  items(row).map((item) => (item.kind === "observation" ? item.observation : item.kind));

const ref = { by: "reference", value: "TGF-26-03412" };

describe("Turia report: every concepto / estado pair", () => {
  test("DESPACHO EXPORTACION / LEVANTE is the export release, known to the day", () => {
    const [release, mrn] = items(
      "TGF-26-03412;12345;DESPACHO EXPORTACION;LEVANTE;23/09/2026;MRN 26ES00461130047821",
    );
    expect(release).toEqual({
      kind: "observation",
      ref,
      observation: { type: "milestone", code: "EXPORT_RELEASED" },
      occurredAt: dayInstant("2026-09-23"),
      precision: "day",
      rule: "turia:DESPACHO EXPORTACION / LEVANTE",
    });
    expect(mrn).toMatchObject({ observation: { type: "note", text: "MRN 26ES00461130047821" } });
  });

  test("DESPACHO IMPORTACION / PEDIMENTO PRESENTADO is the import entry lodged", () => {
    expect(
      observations("TGF-26-03290;48176;DESPACHO IMPORTACION;PEDIMENTO PRESENTADO;05/10/2026;"),
    ).toEqual([{ type: "milestone", code: "IMPORT_LODGED" }]);
  });

  test("DESPACHO IMPORTACION / DESADUANADO is the import release, and clears a customs hold", () => {
    const parsed = items(
      "TGF-26-03290;48176;DESPACHO IMPORTACION;DESADUANADO;07/10/2026;Factura rectificada aceptada",
    );
    expect(parsed.map((item) => item.kind === "observation" && item.observation)).toEqual([
      { type: "milestone", code: "IMPORT_RELEASED" },
      { type: "hold", hold: "customs", state: "cleared", reason: "Factura rectificada aceptada" },
      { type: "note", text: "Factura rectificada aceptada" },
    ]);
    // The row gives the day of the release, not the hour: the hold is cleared as of the receipt.
    expect(parsed[0]).toMatchObject({ occurredAt: dayInstant("2026-10-07"), precision: "day" });
    expect(parsed[1]).not.toHaveProperty("occurredAt");
  });

  test("ENTREGA / ETA is a day-precision estimate for the delivery", () => {
    expect(items("TGF-26-03412;12345;ENTREGA;ETA;14/10/2026;")).toEqual([
      {
        kind: "observation",
        ref,
        observation: {
          type: "estimate",
          code: "DELIVERED",
          at: dayInstant("2026-10-14"),
          precision: "day",
        },
        rule: "turia:ENTREGA / ETA",
      },
    ]);
  });

  test("ENTREGA / ETA keeps its remark with the estimate", () => {
    const [estimate] = items(
      "TGF-26-03412;12345;ENTREGA;ETA;16/10/2026;Atraque NORAY ALTAIR previsto 11/10 por cierre del puerto",
    );
    expect(estimate).toMatchObject({
      observation: { remark: "Atraque NORAY ALTAIR previsto 11/10 por cierre del puerto" },
    });
  });

  test("ENTREGA / ETA PENDIENTE withdraws the estimate", () => {
    expect(items("TGF-26-03290;48176;ENTREGA;ETA PENDIENTE;;Pendiente de aduana")).toEqual([
      {
        kind: "observation",
        ref: { by: "reference", value: "TGF-26-03290" },
        observation: {
          type: "estimate_withdrawn",
          code: "DELIVERED",
          remark: "Pendiente de aduana",
        },
        rule: "turia:ENTREGA / ETA PENDIENTE",
      },
    ]);
  });

  test("ENTREGA / ENTREGADO is the delivery, known to the day", () => {
    expect(items("TGF-26-03188;48190;ENTREGA;ENTREGADO;01/10/2026;")).toEqual([
      expect.objectContaining({
        observation: { type: "milestone", code: "DELIVERED" },
        occurredAt: dayInstant("2026-10-01"),
        precision: "day",
      }),
    ]);
  });

  test("DOCUMENTO / BL EMITIDO is a bill of lading received", () => {
    expect(items("TGF-26-03412;12345;DOCUMENTO;BL EMITIDO;28/09/2026;")).toEqual([
      expect.objectContaining({
        observation: { type: "document", docType: "bill_of_lading" },
        occurredAt: dayInstant("2026-09-28"),
      }),
    ]);
  });

  test("the tests above cover every row of the table", () => {
    expect(TURIA_REPORT.map((row) => `${row.concepto} / ${row.estado}`)).toEqual([
      "DESPACHO EXPORTACION / LEVANTE",
      "DESPACHO IMPORTACION / PEDIMENTO PRESENTADO",
      "DESPACHO IMPORTACION / DESADUANADO",
      "ENTREGA / ETA",
      "ENTREGA / ETA PENDIENTE",
      "ENTREGA / ENTREGADO",
      "DOCUMENTO / BL EMITIDO",
    ]);
  });

  test("anything else is a note", () => {
    expect(
      observations("TGF-26-03412;12345;DESPACHO IMPORTACION;EN REVISION;06/10/2026;Semáforo rojo"),
    ).toEqual([{ type: "note", text: "DESPACHO IMPORTACION / EN REVISION: Semáforo rojo" }]);
  });

  test("the report names no place: the milestone itself says where it happens", () => {
    for (const item of items(
      "TGF-26-03290;48176;DESPACHO IMPORTACION;PEDIMENTO PRESENTADO;05/10/2026;",
    )) {
      expect(item.kind === "observation" && "place" in item.observation).toBe(false);
    }
  });
});

describe("Turia emails", () => {
  const email = [
    "De: operaciones@turiaglobal.example",
    "Asunto: Exp. TGF-26-03290 / OC 48176 - Reconocimiento aduanero",
    "Nos informa nuestro agente en Veracruz: el pedimento salió en semáforo rojo.",
  ].join("\n");

  test("an email is handed over as free text for the text interpreter, unread", () => {
    expect(turiaAdapter.parse(message(email, "email"))).toEqual({
      ok: true,
      items: [{ kind: "free_text", ref: { by: "reference", value: "TGF-26-03290" }, text: email }],
    });
  });

  test("an email that quotes no file reference cannot be tied to a shipment: quarantined", () => {
    const result = turiaAdapter.parse(message("Buenos días, ¿alguna novedad?", "email"));
    expect(result).toEqual({ ok: false, reason: "no file reference in the email" });
  });

  test("a report row sent by email is still free text: the channel decides", () => {
    const row = "TGF-26-03412;12345;ENTREGA;ETA;14/10/2026;";
    expect(turiaAdapter.parse(message(row, "email"))).toMatchObject({
      ok: true,
      items: [{ kind: "free_text" }],
    });
  });
});

describe("Turia: malformed payloads", () => {
  test.each([
    ["an empty report", ""],
    ["too few fields", "TGF-26-03412;12345;ENTREGA;ETA"],
    ["a reference that is not a Turia file", "CRZ-2290311;12345;ENTREGA;ETA;14/10/2026;"],
    ["a date in another format", "TGF-26-03412;12345;ENTREGA;ETA;2026-10-14;"],
    ["a day that does not exist", "TGF-26-03412;12345;ENTREGA;ETA;31/02/2026;"],
    ["an estimate without a date", "TGF-26-03412;12345;ENTREGA;ETA;;"],
    ["a release without a date", "TGF-26-03412;12345;DESPACHO EXPORTACION;LEVANTE;;"],
    ["a row without a status", "TGF-26-03412;12345;ENTREGA;;14/10/2026;"],
  ])("quarantines %s and never throws", (_, row) => {
    expect(turiaAdapter.parse(message(row))).toEqual({ ok: false, reason: expect.any(String) });
  });

  test("quarantines a message on a channel Turia does not use", () => {
    const row = `${TURIA_HEADER}\nTGF-26-03412;12345;ENTREGA;ETA;14/10/2026;`;
    expect(turiaAdapter.parse(message(row, "webhook"))).toEqual({
      ok: false,
      reason: 'unexpected channel "webhook"',
    });
  });
});

describe("Turia: emitter and adapter agree", () => {
  test("the emitter writes rows exactly as Turia does, each under the header", () => {
    expect(
      emitTuriaRow({
        expediente: "TGF-26-03412",
        refCliente: "12345",
        observation: { type: "milestone", code: "EXPORT_RELEASED" },
        occurredAt: dayInstant("2026-09-23"),
        observaciones: "MRN 26ES00461130047821",
      }),
    ).toBe(
      `${TURIA_HEADER}\nTGF-26-03412;12345;DESPACHO EXPORTACION;LEVANTE;23/09/2026;MRN 26ES00461130047821`,
    );
    expect(
      emitTuriaRow({
        expediente: "TGF-26-03290",
        refCliente: "48176",
        observation: { type: "estimate_withdrawn", code: "DELIVERED" },
        observaciones: "Pendiente de aduana",
      }),
    ).toBe(`${TURIA_HEADER}\nTGF-26-03290;48176;ENTREGA;ETA PENDIENTE;;Pendiente de aduana`);
  });

  test.each<[string, Observation, number | undefined]>([
    ["an import entry", { type: "milestone", code: "IMPORT_LODGED" }, dayInstant("2026-10-05")],
    ["a delivery", { type: "milestone", code: "DELIVERED" }, dayInstant("2026-10-01")],
    [
      "a door estimate",
      { type: "estimate", code: "DELIVERED", at: dayInstant("2026-10-14"), precision: "day" },
      undefined,
    ],
    ["a withdrawn estimate", { type: "estimate_withdrawn", code: "DELIVERED" }, undefined],
    ["a bill of lading", { type: "document", docType: "bill_of_lading" }, dayInstant("2026-09-28")],
  ])("%s survives the round trip", (_, observation, occurredAt) => {
    const body = emitTuriaRow({
      expediente: "TGF-26-03412",
      refCliente: "12345",
      observation,
      ...(occurredAt !== undefined ? { occurredAt } : {}),
    });
    const result = turiaAdapter.parse(message(body));
    expect(result).toEqual({
      ok: true,
      items: [
        {
          kind: "observation",
          ref,
          observation,
          ...(occurredAt !== undefined ? { occurredAt, precision: "day" } : {}),
          rule: expect.stringContaining("turia:"),
        },
      ],
    });
  });
});
