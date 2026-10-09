import { z } from "zod";
import { MILESTONE_CODES } from "@/domain/shipment";

/** Bumped whenever the shape of a logged event changes: an older session is then discarded. */
export const SESSION_VERSION = 2;

const instant = z.number();
const precision = z.enum(["minute", "day"]);
const milestoneCode = z.enum(MILESTONE_CODES);
const documentType = z.enum([
  "commercial_invoice",
  "packing_list",
  "export_declaration",
  "bill_of_lading",
  "cmr",
  "delivery_note",
  "proof_of_delivery",
]);
const exceptionType = z.enum([
  "customs_hold",
  "carrier_hold",
  "delay",
  "predicted_delay",
  "cutoff_risk",
  "stale",
]);

const place = z.object({
  name: z.string(),
  country: z.enum(["ES", "FR", "DE", "MX"]),
  zone: z.enum(["Europe/Madrid", "Europe/Paris", "Europe/Berlin", "America/Mexico_City"]),
  locode: z.string().optional(),
});

const fact = z.discriminatedUnion("type", [
  z.object({ type: z.literal("milestone"), code: milestoneCode, place }),
  z.object({
    type: z.literal("estimate"),
    code: milestoneCode,
    place,
    at: instant,
    precision,
    remark: z.string().optional(),
  }),
  z.object({
    type: z.literal("estimate_withdrawn"),
    code: milestoneCode,
    place,
    remark: z.string().optional(),
  }),
  z.object({
    type: z.literal("hold"),
    hold: z.enum(["customs", "carrier"]),
    state: z.enum(["raised", "cleared"]),
    reason: z.string(),
    requires: documentType.optional(),
  }),
  z.object({ type: z.literal("position"), place: z.string() }),
  z.object({ type: z.literal("note"), text: z.string() }),
]);

const operatorEvent = z.object({
  kind: z.literal("operator"),
  key: z.string(),
  shipmentId: z.string(),
  source: z.string(),
  rawId: z.string(),
  fact,
  occurredAt: instant,
  precision,
  receivedAt: instant,
  reading: z.object({ method: z.enum(["table", "ai"]), rule: z.string() }),
});

const internal = {
  kind: z.literal("internal"),
  id: z.string(),
  shipmentId: z.string(),
  at: instant,
  by: z.string(),
};

const internalEvent = z.discriminatedUnion("type", [
  z.object({
    ...internal,
    type: z.literal("reading_reviewed"),
    eventKey: z.string(),
    accepted: z.boolean(),
  }),
  z.object({
    ...internal,
    type: z.literal("notice_sent"),
    exception: exceptionType,
    subject: z.string(),
    body: z.string(),
    published: z
      .object({
        day: z.string(),
        at: instant,
        precision,
        basis: z.enum(["operator_estimate", "estela_estimate"]),
      })
      .nullable(),
  }),
  z.object({
    ...internal,
    type: z.literal("operator_contacted"),
    exception: exceptionType,
    operatorId: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
  z.object({
    ...internal,
    type: z.literal("document_sent"),
    exception: exceptionType,
    docType: documentType,
    fileName: z.string(),
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
]);

const documentEvent = z.object({
  kind: z.literal("document"),
  id: z.string(),
  shipmentId: z.string(),
  at: instant,
  source: z.string(),
  rawId: z.string().optional(),
  docType: documentType,
  fileName: z.string(),
  customerVisible: z.boolean(),
});

const sessionSchema = z.object({
  version: z.literal(SESSION_VERSION),
  startedAt: z.number(),
  raws: z.array(
    z.object({
      id: z.string(),
      operatorId: z.string(),
      channel: z.enum(["csv", "webhook", "api", "report", "email"]),
      receivedAt: instant,
      body: z.string(),
    }),
  ),
  events: z.array(z.union([operatorEvent, internalEvent, documentEvent])),
  unprocessed: z.array(
    z.object({
      rawId: z.string(),
      reason: z.enum(["quarantined", "orphan"]),
      detail: z.string(),
    }),
  ),
});

/**
 * A session as storage holds it. The store writes one from the log's own types and hands one
 * back to the log, so the compiler keeps this schema and those types from drifting apart.
 */
export type StoredSession = z.infer<typeof sessionSchema>;

/** Storage is outside the program: whatever does not have this exact shape is no session. */
export function parseSession(stored: string | null): StoredSession | null {
  if (stored === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return null;
  }
  const parsed = sessionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
