import { z } from "zod";
import type { OperatorAdapter } from "@/application/ports/operator-adapter";
import type { Correlation, ParsedItem, ParseResult } from "@/domain/ingestion";
import { firstIssue, parsed, parseJson, quarantined } from "../shared";
import { NORAY, NORAY_EQUIPMENT, NORAY_PORTS, NORAY_TRANSPORT } from "./mapping";

const common = {
  eventClassifierCode: z.enum(["ACT", "EST", "PLN"]),
  eventDateTime: z.iso.datetime({ offset: true }),
  UNLocationCode: z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}$/),
};

const equipmentSchema = z.object({
  eventType: z.literal("EQUIPMENT"),
  equipmentEventTypeCode: z.string().min(1),
  emptyIndicatorCode: z.enum(["LADEN", "EMPTY"]),
  equipmentReference: z.string().min(1),
  ...common,
});

const transportSchema = z.object({
  eventType: z.literal("TRANSPORT"),
  transportEventTypeCode: z.string().min(1),
  vesselName: z.string().min(1),
  carrierVoyageNumber: z.string().min(1),
  delayReasonCode: z.string().nullish(),
  changeRemark: z.string().nullish(),
  ...common,
});

const eventSchema = z.discriminatedUnion("eventType", [equipmentSchema, transportSchema]);

type EquipmentEvent = z.infer<typeof equipmentSchema>;
type TransportEvent = z.infer<typeof transportSchema>;

function note(ref: Correlation, text: string, occurredAt: number): ParsedItem {
  return {
    kind: "observation",
    ref,
    observation: { type: "note", text },
    occurredAt,
    precision: "minute",
    rule: "noray:unmapped event",
  };
}

function readEquipment(event: EquipmentEvent): ParsedItem[] {
  // Planned moves and empty boxes say nothing about our cargo.
  if (event.eventClassifierCode === "PLN" || event.emptyIndicatorCode === "EMPTY") return [];

  const ref: Correlation = { by: "reference", value: event.equipmentReference };
  const occurredAt = Date.parse(event.eventDateTime);
  const port = NORAY_PORTS[event.UNLocationCode];
  const rule = NORAY_EQUIPMENT.find(
    (row) => row.code === event.equipmentEventTypeCode && row.role === port?.role,
  );
  if (!port || !rule || event.eventClassifierCode !== "ACT") {
    const what = `${event.equipmentEventTypeCode} ${event.eventClassifierCode} ${event.emptyIndicatorCode}`;
    return [note(ref, `Equipment event ${what} at ${event.UNLocationCode}`, occurredAt)];
  }
  return [
    {
      kind: "observation",
      ref,
      observation: { type: "milestone", code: rule.milestone, place: port.place },
      occurredAt,
      precision: "minute",
      rule: `noray:EQUIPMENT ${rule.code} ACT LADEN at ${rule.role}`,
    },
  ];
}

function readTransport(event: TransportEvent): ParsedItem[] {
  if (event.eventClassifierCode === "PLN") return [];

  const ref: Correlation = {
    by: "voyage",
    vessel: event.vesselName,
    voyage: event.carrierVoyageNumber,
  };
  const eventTime = Date.parse(event.eventDateTime);
  const port = NORAY_PORTS[event.UNLocationCode];
  const rule = NORAY_TRANSPORT.find(
    (row) =>
      row.code === event.transportEventTypeCode &&
      row.classifier === event.eventClassifierCode &&
      row.role === port?.role,
  );
  if (!port || !rule) {
    const what = `${event.transportEventTypeCode} ${event.eventClassifierCode}`;
    return [note(ref, `Transport event ${what} at ${event.UNLocationCode}`, eventTime)];
  }

  const name = `noray:TRANSPORT ${rule.code} ${rule.classifier}`;
  if (rule.classifier === "ACT") {
    return [
      {
        kind: "observation",
        ref,
        observation: { type: "milestone", code: rule.milestone, place: port.place },
        occurredAt: eventTime,
        precision: "minute",
        rule: name,
      },
    ];
  }
  // An estimate says when the vessel will arrive, not when the line said so: the receipt time
  // stands in for the moment of the statement.
  const remark = [event.delayReasonCode, event.changeRemark].filter(Boolean).join(": ");
  return [
    {
      kind: "observation",
      ref,
      observation: {
        type: "estimate",
        code: rule.milestone,
        place: port.place,
        at: eventTime,
        precision: "minute",
        ...(remark ? { remark } : {}),
      },
      rule: name,
    },
  ];
}

export const norayAdapter: OperatorAdapter = {
  operatorId: NORAY,
  parse(raw): ParseResult {
    const json = parseJson(raw.body);
    if (!json.ok) return quarantined("not JSON");
    const event = eventSchema.safeParse(json.value);
    if (!event.success) return quarantined(firstIssue(event.error));
    return parsed(
      event.data.eventType === "EQUIPMENT" ? readEquipment(event.data) : readTransport(event.data),
    );
  },
};
