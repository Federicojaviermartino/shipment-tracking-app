import type {
  DocumentType,
  HoldKind,
  MilestoneCode,
  OperatorId,
  Place,
  ShipmentId,
  Source,
  UserId,
} from "./shipment";
import { compareText } from "./compare";
import type { Instant, LocalDate, Precision } from "./time";

export type Channel = "csv" | "webhook" | "api" | "report" | "email";

/** What an operator sent, verbatim: the thing shown under "Show original". */
export type RawMessage = {
  id: string;
  operatorId: Source;
  channel: Channel;
  receivedAt: Instant;
  body: string;
};

export type Fact =
  | { type: "milestone"; code: MilestoneCode; place: Place }
  | {
      type: "estimate";
      code: MilestoneCode;
      place: Place;
      at: Instant;
      precision: Precision;
      remark?: string;
    }
  | { type: "estimate_withdrawn"; code: MilestoneCode; place: Place; remark?: string }
  | {
      type: "hold";
      hold: HoldKind;
      state: "raised" | "cleared";
      reason: string;
      /** The document the hold is said to be waiting for. Absent means none was named. */
      requires?: DocumentType;
    }
  | { type: "position"; place: string }
  | { type: "note"; text: string };

/** How a raw message became a fact: by a row of a mapping table, or by a model reading free text. */
export type Reading = { method: "table"; rule: string } | { method: "ai"; rule: string };

export type OperatorEvent = {
  kind: "operator";
  /** Idempotency: operator, reference, shipment, fact signature and time. */
  key: string;
  shipmentId: ShipmentId;
  source: Source;
  rawId: string;
  fact: Fact;
  occurredAt: Instant;
  precision: Precision;
  receivedAt: Instant;
  reading: Reading;
};

export type ExceptionType =
  "customs_hold" | "carrier_hold" | "delay" | "predicted_delay" | "cutoff_risk" | "stale";

/**
 * The door date a customer notice communicates, taken by code from the dates at the moment of
 * sending: the date a customer reads never depends on the wording of the message.
 */
export type PublishedSnapshot = {
  day: LocalDate;
  at: Instant;
  precision: Precision;
  basis: "operator_estimate" | "estela_estimate";
};

type InternalEventBase = {
  kind: "internal";
  id: string;
  shipmentId: ShipmentId;
  at: Instant;
  by: UserId;
};

export type ReadingReviewed = InternalEventBase & {
  type: "reading_reviewed";
  eventKey: string;
  accepted: boolean;
};
export type NoticeSent = InternalEventBase & {
  type: "notice_sent";
  exception: ExceptionType;
  subject: string;
  body: string;
  published: PublishedSnapshot | null;
};
export type OperatorContacted = InternalEventBase & {
  type: "operator_contacted";
  exception: ExceptionType;
  operatorId: OperatorId;
  subject: string;
  body: string;
};
export type DocumentSent = InternalEventBase & {
  type: "document_sent";
  exception: ExceptionType;
  docType: DocumentType;
  fileName: string;
  to: OperatorId;
  subject: string;
  body: string;
};
export type InternalEvent = ReadingReviewed | NoticeSent | OperatorContacted | DocumentSent;

export type DocumentEvent = {
  kind: "document";
  id: string;
  shipmentId: ShipmentId;
  at: Instant;
  source: Source;
  /** Set when an operator message announced the document. */
  rawId?: string;
  docType: DocumentType;
  fileName: string;
  customerVisible: boolean;
};

export type LoggedEvent = OperatorEvent | InternalEvent | DocumentEvent;

/** The identity the store dedupes on. */
export function eventId(event: LoggedEvent): string {
  return event.kind === "operator" ? event.key : event.id;
}

/** Every operator event, redeliveries included: the fold decides which receipt of a key stands. */
export function operatorEvents(events: readonly LoggedEvent[]): OperatorEvent[] {
  return events.filter((event): event is OperatorEvent => event.kind === "operator");
}

/** A record appended twice is one record: the log is read as a set. */
function once<E extends { id: string }>(events: E[]): E[] {
  const byId = new Map<string, E>();
  for (const event of events) {
    if (!byId.has(event.id)) byId.set(event.id, event);
  }
  return [...byId.values()];
}

export function internalEvents(events: readonly LoggedEvent[]): InternalEvent[] {
  return once(events.filter((event): event is InternalEvent => event.kind === "internal"));
}

export function documentEvents(events: readonly LoggedEvent[]): DocumentEvent[] {
  return once(events.filter((event): event is DocumentEvent => event.kind === "document"));
}

/**
 * What a person last decided about each model reading, by the key of the event that was read.
 * A reading can be reviewed again: the later review stands, and the id settles a tie.
 */
export function latestReviews(events: readonly LoggedEvent[]): Map<string, ReadingReviewed> {
  const latest = new Map<string, ReadingReviewed>();
  for (const event of internalEvents(events)) {
    if (event.type !== "reading_reviewed") continue;
    const kept = latest.get(event.eventKey);
    const later =
      !kept || event.at > kept.at || (event.at === kept.at && compareText(event.id, kept.id) > 0);
    if (later) latest.set(event.eventKey, event);
  }
  return latest;
}

/** Customer notices, oldest first. */
export function noticesSent(events: readonly LoggedEvent[]): NoticeSent[] {
  return internalEvents(events)
    .filter((event): event is NoticeSent => event.type === "notice_sent")
    .sort((a, b) => a.at - b.at || compareText(a.id, b.id));
}
