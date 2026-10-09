import type { Estimate, EstimateStep } from "./estimate";
import { toLoggedEvent, type Observation } from "./ingestion";
import type {
  DocumentEvent,
  DocumentSent,
  NoticeSent,
  OperatorContacted,
  OperatorEvent,
  PublishedSnapshot,
  Reading,
  ReadingReviewed,
} from "./log";
import {
  IBON,
  milestoneKey,
  ZONE_OF_COUNTRY,
  type Country,
  type DocumentType,
  type HoldKind,
  type MilestoneCode,
  type Place,
  type PlannedMilestone,
  type Shipment,
  type Source,
} from "./shipment";
import { dayInstant, instantAt, MINUTE, type Instant, type Precision, type Zone } from "./time";

/**
 * Small shipments and event factories for the domain's own tests: a door-to-door ocean booking
 * and a road booking, written against the real calendar so that every date can be read.
 */

export const MADRID: Zone = "Europe/Madrid";
export const MEXICO: Zone = "America/Mexico_City";

export function at(local: string, zone: Zone = MADRID): Instant {
  const [date, time] = local.split(" ");
  return instantAt(date ?? "", time ?? "", zone);
}

export const day = dayInstant;

function place(name: string, country: Country): Place {
  return { name, country, zone: ZONE_OF_COUNTRY[country] };
}

export const ZARAGOZA = place("Zaragoza", "ES");
export const VALENCIA = place("Valencia", "ES");
export const VERACRUZ = place("Veracruz", "MX");
export const QUERETARO = place("Querétaro", "MX");
export const PERPIGNAN = place("Perpignan", "FR");
export const SAINT_PRIEST = place("Saint-Priest", "FR");

function plan(
  code: MilestoneCode,
  sectionId: string | null,
  where: Place,
  plannedAt: Instant,
  reporters: Source[],
  precision: Precision = "minute",
): PlannedMilestone {
  return {
    key: milestoneKey(code, where),
    code,
    sectionId,
    place: where,
    plannedAt,
    precision,
    reporters,
  };
}

/** Zaragoza to Querétaro by sea, sailing Fri 25 Sep 2026, committed for Thu 15 Oct. */
export function oceanShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "EST-1",
    orderRef: "70001",
    accountId: "AQB",
    originSiteId: "ZAZ",
    consignee: { name: "Querétaro plant", place: QUERETARO },
    incoterm: { code: "DAP", place: "Querétaro" },
    cargo: {
      description: "MV pumps",
      packages: "3 pump sets",
      grossWeightKg: 11200,
      container: { size: "40'HC", number: "NRYU4821373" },
    },
    committedDate: "2026-10-15",
    sections: [
      {
        id: "pre",
        kind: "road",
        operatorId: "CRZ",
        from: ZARAGOZA,
        to: VALENCIA,
        telematics: false,
      },
      { id: "origin", kind: "port", place: VALENCIA, gate: "export" },
      { id: "sea", kind: "sea", operatorId: "NRY", from: VALENCIA, to: VERACRUZ },
      { id: "destination", kind: "port", place: VERACRUZ, gate: "import" },
      {
        id: "door",
        kind: "road",
        operatorId: "TGF",
        from: VERACRUZ,
        to: QUERETARO,
        telematics: false,
      },
    ],
    plan: [
      plan("BOOKED", null, ZARAGOZA, at("2026-09-16 10:00"), [IBON]),
      plan("PICKED_UP", "pre", ZARAGOZA, at("2026-09-21 15:00"), ["CRZ"]),
      plan("GATE_IN", "origin", VALENCIA, at("2026-09-22 08:00"), ["NRY", "CRZ"]),
      plan("EXPORT_RELEASED", "origin", VALENCIA, day("2026-09-23"), ["TGF"], "day"),
      plan("LOADED", "origin", VALENCIA, at("2026-09-25 03:00"), ["NRY"]),
      plan("VESSEL_DEPARTED", "sea", VALENCIA, at("2026-09-25 20:00"), ["NRY"]),
      plan("VESSEL_ARRIVED", "sea", VERACRUZ, at("2026-10-09 06:00", MEXICO), ["NRY"]),
      plan("DISCHARGED", "destination", VERACRUZ, at("2026-10-10 10:00", MEXICO), ["NRY"]),
      plan("IMPORT_LODGED", "destination", VERACRUZ, day("2026-10-12"), ["TGF"], "day"),
      plan("IMPORT_RELEASED", "destination", VERACRUZ, day("2026-10-13"), ["TGF"], "day"),
      plan("GATE_OUT", "destination", VERACRUZ, at("2026-10-13 15:00", MEXICO), ["NRY"]),
      plan("DELIVERED", "door", QUERETARO, day("2026-10-14"), ["TGF"], "day"),
    ],
    refs: [
      { operatorId: "CRZ", kind: "expedition", value: "CRZ-1" },
      { operatorId: "NRY", kind: "container", value: "NRYU4821373" },
      { operatorId: "NRY", kind: "bill_of_lading", value: "NRYVLC1" },
      { operatorId: "TGF", kind: "forwarder_file", value: "TGF-26-00001" },
    ],
    voyage: { vessel: "NORAY ALTAIR", voyage: "612W" },
    deadlines: [
      {
        kind: "export_cutoff",
        at: at("2026-09-24 12:00"),
        label: "Export clearance cut-off for NORAY ALTAIR 612W",
        milestoneKey: milestoneKey("EXPORT_RELEASED", VALENCIA),
      },
      {
        kind: "free_time_end",
        at: at("2026-10-16 23:59", MEXICO),
        label: "Free time ends: demurrage starts",
        milestoneKey: milestoneKey("GATE_OUT", VERACRUZ),
      },
    ],
    ...overrides,
  };
}

/**
 * Valencia to Saint-Priest by road with Eisvogel, through a depot in Valencia and a hub in
 * Perpignan. Picked up Mon 5 Oct 2026, committed for Thu 8 Oct.
 */
export function roadShipment(options: { telematics?: boolean } & Partial<Shipment> = {}): Shipment {
  const { telematics = false, ...overrides } = options;
  const evs = ["EVS"];
  return {
    id: "EST-2",
    orderRef: "70002",
    accountId: "VAU",
    originSiteId: "VLC",
    consignee: { name: "Saint-Priest HQ", place: SAINT_PRIEST },
    incoterm: { code: "CPT", place: "Saint-Priest" },
    cargo: { description: "VB valves", packages: "7 pallets", grossWeightKg: 2650 },
    committedDate: "2026-10-08",
    sections: [
      { id: "road", kind: "road", operatorId: "EVS", from: VALENCIA, to: SAINT_PRIEST, telematics },
    ],
    plan: [
      plan("BOOKED", null, VALENCIA, at("2026-10-01 11:00"), [IBON]),
      plan("PICKED_UP", "road", VALENCIA, at("2026-10-05 15:00"), evs),
      plan("HUB_IN", "road", VALENCIA, at("2026-10-05 18:30"), evs),
      plan("HUB_OUT", "road", VALENCIA, at("2026-10-05 22:00"), evs),
      plan("HUB_IN", "road", PERPIGNAN, at("2026-10-06 06:00"), evs),
      plan("HUB_OUT", "road", PERPIGNAN, at("2026-10-06 20:00"), evs),
      plan("OUT_FOR_DELIVERY", "road", SAINT_PRIEST, at("2026-10-08 07:00"), evs),
      plan("DELIVERED", "road", SAINT_PRIEST, at("2026-10-08 10:00"), evs),
    ],
    refs: [{ operatorId: "EVS", kind: "expedition", value: "EVS-1" }],
    deadlines: [
      {
        kind: "next_departure",
        at: at("2026-10-07 20:00"),
        label: "Next linehaul leaves the Perpignan hub",
        milestoneKey: milestoneKey("HUB_OUT", PERPIGNAN),
      },
    ],
    ...overrides,
  };
}

export type EventOptions = {
  source?: Source;
  /** Defaults to five minutes after it happened. */
  receivedAt?: Instant;
  precision?: Precision;
  place?: Place;
  reading?: Reading;
  remark?: string;
  /** For a hold: the document its reason says is required. */
  requires?: DocumentType;
};

function record(
  shipment: Shipment,
  observation: Exclude<Observation, { type: "document" }>,
  occurredAt: Instant,
  options: EventOptions,
  defaultSource: Source,
): OperatorEvent {
  const source = options.source ?? defaultSource;
  const receivedAt = options.receivedAt ?? occurredAt + 5 * MINUTE;
  const event = toLoggedEvent({
    shipment,
    raw: { id: `raw:${source}:${observation.type}:${receivedAt}`, operatorId: source, receivedAt },
    ref: { by: "reference", value: shipment.id },
    observation,
    occurredAt,
    precision: options.precision ?? "minute",
    reading: options.reading ?? { method: "table", rule: "test" },
  });
  if (event.kind !== "operator") throw new Error("Expected an operator event");
  return event;
}

function reporterOf(shipment: Shipment, code: MilestoneCode, where?: Place): Source {
  const planned = shipment.plan.find(
    (milestone) =>
      milestone.code === code && (!where || milestone.key === milestoneKey(code, where)),
  );
  return planned?.reporters[0] ?? "EVS";
}

/** An operator confirming a milestone. The source defaults to the milestone's first reporter. */
export function confirmed(
  shipment: Shipment,
  code: MilestoneCode,
  occurredAt: Instant,
  options: EventOptions = {},
): OperatorEvent {
  return record(
    shipment,
    { type: "milestone", code, ...(options.place ? { place: options.place } : {}) },
    occurredAt,
    options,
    reporterOf(shipment, code, options.place),
  );
}

/** An operator declaring when a milestone will happen, said at `receivedAt`. */
export function estimated(
  shipment: Shipment,
  code: MilestoneCode,
  due: Instant,
  options: EventOptions & { receivedAt: Instant },
): OperatorEvent {
  return record(
    shipment,
    {
      type: "estimate",
      code,
      at: due,
      precision: options.precision ?? "minute",
      ...(options.place ? { place: options.place } : {}),
      ...(options.remark ? { remark: options.remark } : {}),
    },
    options.receivedAt,
    { ...options, precision: "minute" },
    reporterOf(shipment, code, options.place),
  );
}

export function withdrawn(
  shipment: Shipment,
  code: MilestoneCode,
  receivedAt: Instant,
  options: EventOptions = {},
): OperatorEvent {
  return record(
    shipment,
    { type: "estimate_withdrawn", code, ...(options.remark ? { remark: options.remark } : {}) },
    receivedAt,
    { ...options, receivedAt },
    reporterOf(shipment, code, options.place),
  );
}

export function hold(
  shipment: Shipment,
  kind: HoldKind,
  state: "raised" | "cleared",
  occurredAt: Instant,
  options: EventOptions = {},
): OperatorEvent {
  return record(
    shipment,
    {
      type: "hold",
      hold: kind,
      state,
      reason: options.remark ?? "Held for a document check",
      ...(options.requires ? { requires: options.requires } : {}),
    },
    occurredAt,
    options,
    kind === "customs" ? "TGF" : "CRZ",
  );
}

export function position(
  shipment: Shipment,
  where: string,
  occurredAt: Instant,
  options: EventOptions = {},
): OperatorEvent {
  return record(shipment, { type: "position", place: where }, occurredAt, options, "EVS");
}

export function remark(
  shipment: Shipment,
  text: string,
  occurredAt: Instant,
  options: EventOptions = {},
): OperatorEvent {
  return record(shipment, { type: "note", text }, occurredAt, options, "CRZ");
}

/** A reading made by a model from free text: not a fact until a person accepts it. */
export const AI_READING: Reading = { method: "ai", rule: "test-interpreter" };

export function reviewed(
  event: OperatorEvent,
  accepted: boolean,
  reviewedAt: Instant,
): ReadingReviewed {
  return {
    kind: "internal",
    type: "reading_reviewed",
    id: `review-${event.key}-${reviewedAt}`,
    shipmentId: event.shipmentId,
    at: reviewedAt,
    by: "marta.soler",
    eventKey: event.key,
    accepted,
  };
}

export function noticeSent(
  shipment: Shipment,
  sentAt: Instant,
  published: PublishedSnapshot | null,
): NoticeSent {
  return {
    kind: "internal",
    type: "notice_sent",
    id: `notice-${shipment.id}-${sentAt}`,
    shipmentId: shipment.id,
    at: sentAt,
    by: "marta.soler",
    exception: "delay",
    subject: `Order ${shipment.orderRef}: new delivery estimate`,
    body: "The delivery date has changed.",
    published,
  };
}

export function operatorContacted(
  shipment: Shipment,
  operatorId: Source,
  sentAt: Instant,
): OperatorContacted {
  return {
    kind: "internal",
    type: "operator_contacted",
    id: `contact-${shipment.id}-${sentAt}`,
    shipmentId: shipment.id,
    at: sentAt,
    by: "marta.soler",
    exception: "stale",
    operatorId,
    subject: "Position and ETA",
    body: "Where is the truck?",
  };
}

export function documentSent(
  shipment: Shipment,
  docType: DocumentType,
  to: Source,
  sentAt: Instant,
): DocumentSent {
  return {
    kind: "internal",
    type: "document_sent",
    id: `sent-${shipment.id}-${docType}-${sentAt}`,
    shipmentId: shipment.id,
    at: sentAt,
    by: "marta.soler",
    exception: "cutoff_risk",
    docType,
    fileName: `${docType}.pdf`,
    to,
    subject: "Document attached",
    body: "Attached.",
  };
}

export function documentOnFile(
  shipment: Shipment,
  docType: DocumentType,
  filedAt: Instant,
  customerVisible = true,
): DocumentEvent {
  return {
    kind: "document",
    id: `doc-${shipment.id}-${docType}`,
    shipmentId: shipment.id,
    at: filedAt,
    source: IBON,
    docType,
    fileName: `${docType}.pdf`,
    customerVisible,
  };
}

/** An Estela estimate for the door, as the estimator port would return it. */
export function estelaEstimate(
  doorDay: string,
  options: { steps?: EstimateStep[]; assumption?: string; latest?: string } = {},
): Estimate {
  return {
    withheld: false,
    at: dayInstant(doorDay),
    precision: "day",
    window: { earliest: dayInstant(doorDay), latest: dayInstant(options.latest ?? doorDay) },
    steps: options.steps ?? [],
    ...(options.assumption ? { assumption: options.assumption } : {}),
    basis: "Rule-based estimate",
  };
}

/** Shuffles deterministically, so an order-independence test fails the same way every time. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const other = state % (index + 1);
    const moved = result[index];
    const swapped = result[other];
    if (moved === undefined || swapped === undefined) continue;
    result[index] = swapped;
    result[other] = moved;
  }
  return result;
}
