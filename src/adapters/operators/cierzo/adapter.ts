import { z } from "zod";
import type { OperatorAdapter } from "@/application/ports/operator-adapter";
import type { Correlation, ParsedItem, ParseResult } from "@/domain/ingestion";
import type { Place } from "@/domain/shipment";
import { dayInstant, instantAt, localDate, type Instant } from "@/domain/time";
import { dataRows, firstIssue, parsed, quarantined, toPlaceName } from "../shared";
import {
  CIERZO,
  CIERZO_HEADER,
  CIERZO_HOLD_PATTERNS,
  CIERZO_INCIDENT,
  CIERZO_INCIDENT_RESOLVED,
  CIERZO_MILESTONES,
  CIERZO_NEW_DELIVERY,
  CIERZO_ZONE,
} from "./mapping";

const rowSchema = z.object({
  expedicion: z.string().regex(/^CRZ-\d+$/),
  codigo: z.string().regex(/^\d{2}$/),
  estado: z.string().min(1),
  plaza: z.string().min(1),
  fecha: z.string().regex(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/),
  observaciones: z.string(),
});

type Row = z.infer<typeof rowSchema>;

function readTime(fecha: string): Instant | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2})$/.exec(fecha);
  if (!match) return null;
  try {
    return instantAt(`${match[3]}-${match[2]}-${match[1]}`, match[4] ?? "", CIERZO_ZONE);
  } catch {
    return null;
  }
}

/** The remark gives day and month only: it means the first such day on or after the incident. */
function newDeliveryDay(day: string, month: string, occurredAt: Instant): Instant | null {
  const reported = localDate(occurredAt, CIERZO_ZONE);
  const year = Number(reported.slice(0, 4));
  try {
    const sameYear = `${year}-${month}-${day}`;
    return dayInstant(sameYear >= reported ? sameYear : `${year + 1}-${month}-${day}`);
  } catch {
    return null;
  }
}

function translate(row: Row, occurredAt: Instant): ParsedItem[] {
  const ref: Correlation = { by: "reference", value: row.expedicion };
  const place: Place = { name: toPlaceName(row.plaza), country: "ES", zone: CIERZO_ZONE };
  const remark = row.observaciones;
  const at = { occurredAt, precision: "minute" as const };
  const note = (text: string, rule: string): ParsedItem => ({
    kind: "observation",
    ref,
    observation: { type: "note", text },
    ...at,
    rule,
  });

  const mapped = CIERZO_MILESTONES[row.codigo];
  if (mapped) {
    const milestone: ParsedItem = {
      kind: "observation",
      ref,
      observation: { type: "milestone", code: mapped.milestone, place },
      ...at,
      rule: `cierzo:${row.codigo} ${mapped.text}`,
    };
    return remark ? [milestone, note(remark, "cierzo:remark")] : [milestone];
  }

  if (row.codigo === CIERZO_INCIDENT_RESOLVED.code) {
    return [
      {
        kind: "observation",
        ref,
        observation: {
          type: "hold",
          hold: "carrier",
          state: "cleared",
          reason: remark || "Incident resolved",
        },
        ...at,
        rule: `cierzo:${row.codigo} ${CIERZO_INCIDENT_RESOLVED.text}`,
      },
    ];
  }

  if (row.codigo === CIERZO_INCIDENT.code) {
    for (const { name, pattern, reason } of CIERZO_HOLD_PATTERNS) {
      const match = pattern.exec(remark);
      if (!match) continue;
      return [
        {
          kind: "observation",
          ref,
          observation: { type: "hold", hold: "carrier", state: "raised", reason: reason(match) },
          ...at,
          rule: `cierzo:50 INCIDENCIA (${name})`,
        },
      ];
    }
    const delivery = CIERZO_NEW_DELIVERY.exec(remark);
    const day = delivery ? newDeliveryDay(delivery[1] ?? "", delivery[2] ?? "", occurredAt) : null;
    if (day !== null) {
      return [
        {
          kind: "observation",
          ref,
          observation: { type: "estimate", code: "DELIVERED", at: day, precision: "day" },
          ...at,
          rule: "cierzo:50 INCIDENCIA (new delivery date)",
        },
      ];
    }
    return [note(remark || row.estado, "cierzo:50 INCIDENCIA (remark)")];
  }

  return [note(remark ? `${row.estado}. ${remark}` : row.estado, "cierzo:unmapped code")];
}

export const cierzoAdapter: OperatorAdapter = {
  operatorId: CIERZO,
  parse(raw): ParseResult {
    const rows = dataRows(raw.body, CIERZO_HEADER);
    if (rows.length === 0) return quarantined("no data row");

    const items: ParsedItem[] = [];
    for (const fields of rows) {
      if (fields.length !== 6) return quarantined(`expected 6 fields, got ${fields.length}`);
      const [expedicion, codigo, estado, plaza, fecha, observaciones] = fields;
      const row = rowSchema.safeParse({ expedicion, codigo, estado, plaza, fecha, observaciones });
      if (!row.success) return quarantined(firstIssue(row.error));
      const occurredAt = readTime(row.data.fecha);
      if (occurredAt === null) return quarantined(`fecha: not a date and time "${row.data.fecha}"`);
      items.push(...translate(row.data, occurredAt));
    }
    return parsed(items);
  },
};
