import { z } from "zod";
import type { OperatorAdapter } from "@/application/ports/operator-adapter";
import type { Correlation, ParsedItem, ParseResult } from "@/domain/ingestion";
import { ZONE_OF_COUNTRY, type Country, type Place } from "@/domain/shipment";
import { firstIssue, parsed, parseJson, quarantined } from "../shared";
import { EISVOGEL, EISVOGEL_STATUS } from "./mapping";

const timestamp = z.iso.datetime({ offset: true });

const payloadSchema = z.object({
  sendungsnr: z.string().min(1),
  status: z.string().regex(/^\d{3}$/),
  statustext: z.string(),
  ort: z.string().min(1),
  zeit: timestamp,
  eta: timestamp.nullish(),
  lat: z.number().nullish(),
  lon: z.number().nullish(),
  bemerkung: z.string().nullish(),
});

function isCountry(code: string): code is Country {
  return code in ZONE_OF_COUNTRY;
}

/** "Perpignan, FR" as a place; nothing when the country is one Estela does not ship through. */
function readPlace(ort: string): Place | undefined {
  const match = /^(.+),\s*([A-Z]{2})$/.exec(ort.trim());
  const name = match?.[1]?.trim();
  const country = match?.[2];
  if (!name || !country || !isCountry(country)) return undefined;
  return { name, country, zone: ZONE_OF_COUNTRY[country] };
}

export const eisvogelAdapter: OperatorAdapter = {
  operatorId: EISVOGEL,
  parse(raw): ParseResult {
    const json = parseJson(raw.body);
    if (!json.ok) return quarantined("not JSON");
    const payload = payloadSchema.safeParse(json.value);
    if (!payload.success) return quarantined(firstIssue(payload.error));

    const { sendungsnr, status, statustext, ort, zeit, eta, bemerkung } = payload.data;
    const ref: Correlation = { by: "reference", value: sendungsnr };
    const at = { occurredAt: Date.parse(zeit), precision: "minute" as const };
    const meaning = EISVOGEL_STATUS[status];
    const items: ParsedItem[] = [];

    if (!meaning) {
      const text = bemerkung ? `${statustext}: ${bemerkung}` : statustext || `Status ${status}`;
      items.push({
        kind: "observation",
        ref,
        observation: { type: "note", text },
        ...at,
        rule: "eisvogel:unmapped code",
      });
    } else {
      const place = readPlace(ort);
      items.push({
        kind: "observation",
        ref,
        observation:
          meaning.kind === "position"
            ? { type: "position", place: ort }
            : { type: "milestone", code: meaning.milestone, ...(place ? { place } : {}) },
        ...at,
        rule: `eisvogel:${status} ${meaning.text}`,
      });
      if (bemerkung) {
        items.push({
          kind: "observation",
          ref,
          observation: { type: "note", text: bemerkung },
          ...at,
          rule: "eisvogel:bemerkung",
        });
      }
    }

    const delivered = meaning?.kind === "milestone" && meaning.milestone === "DELIVERED";
    if (eta && !delivered) {
      items.push({
        kind: "observation",
        ref,
        observation: {
          type: "estimate",
          code: "DELIVERED",
          at: Date.parse(eta),
          precision: "minute",
        },
        ...at,
        rule: "eisvogel:eta",
      });
    }
    return parsed(items);
  },
};
