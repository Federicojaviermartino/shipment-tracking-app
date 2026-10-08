import { z } from "zod";
import type { OperatorAdapter } from "@/application/ports/operator-adapter";
import type { Correlation, ParsedItem, ParseResult } from "@/domain/ingestion";
import { dayInstant } from "@/domain/time";
import { dataRows, firstIssue, parsed, parseSpanishDate, quarantined } from "../shared";
import { TURIA, TURIA_FILE_REFERENCE, TURIA_HEADER, TURIA_REPORT } from "./mapping";

const rowSchema = z.object({
  expediente: z.string().regex(/^TGF-\d{2}-\d{5}$/),
  ref_cliente: z.string(),
  concepto: z.string().min(1),
  estado: z.string().min(1),
  fecha: z.string().regex(/^(\d{2}\/\d{2}\/\d{4})?$/),
  observaciones: z.string(),
});

type Row = z.infer<typeof rowSchema>;

function translate(row: Row): ParsedItem[] | string {
  const ref: Correlation = { by: "reference", value: row.expediente };
  const pair = `${row.concepto} / ${row.estado}`;
  const remark = row.observaciones;
  const date = row.fecha ? parseSpanishDate(row.fecha) : null;
  if (row.fecha && !date) return `fecha: not a calendar day "${row.fecha}"`;
  const on = date ? { occurredAt: dayInstant(date), precision: "day" as const } : {};
  const note = (text: string, rule: string): ParsedItem => ({
    kind: "observation",
    ref,
    observation: { type: "note", text },
    ...on,
    rule,
  });

  const rule = TURIA_REPORT.find(
    (entry) => entry.concepto === row.concepto && entry.estado === row.estado,
  );
  if (!rule) return [note(remark ? `${pair}: ${remark}` : pair, "turia:unmapped row")];

  const name = `turia:${pair}`;
  const { meaning } = rule;
  switch (meaning.kind) {
    case "milestone": {
      if (!date) return `fecha: required for ${pair}`;
      const items: ParsedItem[] = [
        {
          kind: "observation",
          ref,
          observation: { type: "milestone", code: meaning.milestone },
          ...on,
          rule: name,
        },
      ];
      if (meaning.clearsCustomsHold) {
        // The row says which day customs released, not when: the hold is cleared as of the
        // moment the report reached us.
        items.push({
          kind: "observation",
          ref,
          observation: {
            type: "hold",
            hold: "customs",
            state: "cleared",
            reason: remark || "Released by customs",
          },
          rule: name,
        });
      }
      if (remark) items.push(note(remark, "turia:remark"));
      return items;
    }
    case "estimate":
      if (!date) return `fecha: required for ${pair}`;
      return [
        {
          kind: "observation",
          ref,
          observation: {
            type: "estimate",
            code: meaning.milestone,
            at: dayInstant(date),
            precision: "day",
            ...(remark ? { remark } : {}),
          },
          rule: name,
        },
      ];
    case "estimate_withdrawn":
      return [
        {
          kind: "observation",
          ref,
          observation: {
            type: "estimate_withdrawn",
            code: meaning.milestone,
            ...(remark ? { remark } : {}),
          },
          rule: name,
        },
      ];
    case "document":
      if (!date) return `fecha: required for ${pair}`;
      return [
        {
          kind: "observation",
          ref,
          observation: { type: "document", docType: meaning.docType },
          ...on,
          rule: name,
        },
      ];
  }
}

function readReport(body: string): ParseResult {
  const rows = dataRows(body, TURIA_HEADER);
  if (rows.length === 0) return quarantined("no data row");

  const items: ParsedItem[] = [];
  for (const fields of rows) {
    if (fields.length !== 6) return quarantined(`expected 6 fields, got ${fields.length}`);
    const [expediente, ref_cliente, concepto, estado, fecha, observaciones] = fields;
    const row = rowSchema.safeParse({
      expediente,
      ref_cliente,
      concepto,
      estado,
      fecha,
      observaciones,
    });
    if (!row.success) return quarantined(firstIssue(row.error));
    const translated = translate(row.data);
    if (typeof translated === "string") return quarantined(translated);
    items.push(...translated);
  }
  return parsed(items);
}

/** An email is free text: it is handed over unread, for the text interpreter and a person. */
function readEmail(body: string): ParseResult {
  const reference = TURIA_FILE_REFERENCE.exec(body)?.[0];
  if (!reference) return quarantined("no file reference in the email");
  return parsed([{ kind: "free_text", ref: { by: "reference", value: reference }, text: body }]);
}

export const turiaAdapter: OperatorAdapter = {
  operatorId: TURIA,
  parse(raw): ParseResult {
    if (raw.channel === "report") return readReport(raw.body);
    if (raw.channel === "email") return readEmail(raw.body);
    return quarantined(`unexpected channel "${raw.channel}"`);
  },
};
