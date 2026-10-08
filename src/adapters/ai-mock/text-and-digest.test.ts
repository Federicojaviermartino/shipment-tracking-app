import { describe, expect, test } from "vitest";
import type { DigestCase } from "@/application/ports/digest-writer";
import { instantAt } from "@/domain/time";
import { patternTextInterpreter } from "./pattern-text-interpreter";
import { templateDigestWriter } from "./template-digest-writer";

const read = (text: string) => patternTextInterpreter.read({ operatorId: "TGF", text });

/** The email of the demo world, as the forwarder wrote it: line breaks in the middle of sentences. */
const EMAIL = [
  "De: operaciones@turiaglobal.example",
  "Asunto: Exp. TGF-26-03290 / OC 48176 - Reconocimiento aduanero",
  "Nos informa nuestro agente en Veracruz: el pedimento salió en semáforo rojo. En el reconocimiento, la",
  "aduana detecta discrepancia de peso bruto entre la factura comercial (4.180 kg) y el BL (4.810 kg).",
  "La mercancía queda retenida hasta presentar factura rectificada. El plazo libre en terminal vence el",
  "viernes 9.",
].join("\n");

describe("the pattern text interpreter", () => {
  test("reads the customs email as a hold, with the documents, the weights and what is asked for", async () => {
    expect(await read(EMAIL)).toEqual({
      observation: {
        type: "hold",
        hold: "customs",
        state: "raised",
        reason:
          "Customs found a gross-weight discrepancy between the commercial invoice (4,180 kg) and the bill of lading (4,810 kg); a corrected invoice is required.",
      },
      rule: "pattern:customs hold",
    });
  });

  test("composes the reading from the text: other documents and weights give another reading", async () => {
    const other = await read(
      "Aduana: discrepancia de peso entre la lista de empaque (12.500,5 kg) y la factura comercial (950 kg). Mercancía retenida.",
    );
    expect(other?.observation).toMatchObject({
      hold: "customs",
      reason:
        "Customs found a weight discrepancy between the packing list (12,500.5 kg) and the commercial invoice (950 kg).",
    });
  });

  test("a hold with no stated cause is still a hold, without an invented reason", async () => {
    const result = await read("El pedimento salió en semáforo rojo. La mercancía queda retenida.");
    expect(result?.observation).toMatchObject({
      type: "hold",
      hold: "customs",
      reason: "Customs is holding the goods after an inspection.",
    });
  });

  test("goods held with no mention of customs are held by the carrier", async () => {
    const result = await read("Mercancía retenida en plataforma a la espera de instrucciones.");
    expect(result).toMatchObject({
      observation: { type: "hold", hold: "carrier", state: "raised" },
      rule: "pattern:carrier hold",
    });
  });

  test("text it cannot read is left unread: no reading is better than a guess", async () => {
    expect(await read("Buenos días, adjuntamos la factura del flete. Un saludo.")).toBeNull();
    expect(await read("")).toBeNull();
    // A weight discrepancy that nobody is holding the goods for is not a hold.
    expect(await read("Detectada discrepancia de peso, pendiente de revisar.")).toBeNull();
  });
});

describe("the template digest writer", () => {
  const now = instantAt("2026-10-07", "16:00", "Europe/Madrid");
  const linehaul: DigestCase = {
    shipmentId: "EST-4134",
    exception: "predicted_delay",
    deadline: {
      kind: "next_departure",
      at: instantAt("2026-10-07", "20:00", "Europe/Paris"),
      zone: "Europe/Paris",
      milestone: { code: "HUB_OUT", place: "Perpignan" },
    },
    documents: [],
    vessel: null,
  };
  const cutoff: DigestCase = {
    shipmentId: "EST-4116",
    exception: "cutoff_risk",
    deadline: {
      kind: "export_cutoff",
      at: instantAt("2026-10-08", "12:00", "Europe/Madrid"),
      zone: "Europe/Madrid",
      milestone: { code: "EXPORT_RELEASED", place: "Valencia" },
    },
    documents: ["commercial_invoice"],
    vessel: "NORAY DENEB",
  };

  test("writes one sentence from the cases it is given, nearest deadline first", async () => {
    expect(await templateDigestWriter.highlight({ now, cases: [cutoff, linehaul] })).toBe(
      "Where acting today changes the outcome: EST-4134 can still make tonight's 20:00 linehaul from Perpignan, and EST-4116 needs its commercial invoice before tomorrow's 12:00 export cut-off or it misses NORAY DENEB.",
    );
  });

  test("says when a deadline is in words that depend on the clock it is read at", async () => {
    const morning = instantAt("2026-10-07", "09:00", "Europe/Madrid");
    const monday = instantAt("2026-10-05", "09:00", "Europe/Madrid");
    const round: DigestCase = {
      ...linehaul,
      deadline: {
        kind: "next_departure",
        at: instantAt("2026-10-07", "14:00", "Europe/Madrid"),
        zone: "Europe/Madrid",
        milestone: { code: "OUT_FOR_DELIVERY", place: "Málaga" },
      },
    };
    expect(await templateDigestWriter.highlight({ now: morning, cases: [round] })).toBe(
      "Where acting today changes the outcome: EST-4134 can still make today's 14:00 delivery round from Málaga.",
    );
    expect(await templateDigestWriter.highlight({ now: monday, cases: [cutoff] })).toContain(
      "before the Thu 8 Oct 12:00 export cut-off",
    );
  });

  test("has nothing to say when no case is bound to a deadline", async () => {
    expect(await templateDigestWriter.highlight({ now, cases: [] })).toBeNull();
  });
});
