import type { Published, ShipmentDates } from "./dates";
import type { Health } from "./exceptions";
import { documentEvents, noticesSent, type LoggedEvent, type PublishedSnapshot } from "./log";
import type {
  Country,
  DocumentType,
  HoldKind,
  MilestoneCode,
  Shipment,
  ShipmentId,
  UserId,
} from "./shipment";
import { stageOf, type Stage } from "./stage";
import { milestonesOf, openHolds, type MilestoneEntry, type Timeline } from "./timeline";
import {
  diffDays,
  localDate,
  type Instant,
  type LocalDate,
  type Precision,
  type Zone,
} from "./time";

/**
 * What a customer may see, as a type of its own: data minimisation is a narrower shape, not a
 * hidden element. There is no field here for raw payloads, operators' words, notes, positions, hub
 * scans, unconfirmed readings, Estela estimates, exceptions, steps, clocks or internal documents.
 */

export type Verdict = "delivered" | "on_hold" | "delayed" | "on_time" | "in_progress";

export type CustomerStamp = {
  at: Instant;
  precision: Precision;
  kind: "confirmed" | "estimated" | "planned";
};

export type CustomerPlace = { name: string; country: Country; zone: Zone };

const CUSTOMER_MILESTONES: ReadonlySet<MilestoneCode> = new Set([
  "PICKED_UP",
  "GATE_IN",
  "VESSEL_DEPARTED",
  "VESSEL_ARRIVED",
  "IMPORT_LODGED",
  "IMPORT_RELEASED",
  "GATE_OUT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
]);

export type CustomerMilestone = {
  key: string;
  code: MilestoneCode;
  place: CustomerPlace;
  state: MilestoneEntry["state"];
  /** `null` reads "Not reported" or "No estimate yet": never a made-up time. */
  when: CustomerStamp | null;
};

export type CustomerPublished =
  | { kind: "confirmed"; day: LocalDate; at: Instant; precision: Precision }
  | {
      kind: "estimated";
      day: LocalDate;
      at: Instant;
      precision: Precision;
      by: { kind: "carrier" } | { kind: "notice"; noticeId: string; approvedBy: UserId };
    }
  | { kind: "planned"; day: LocalDate; at: Instant; precision: Precision }
  | { kind: "under_review"; was?: LocalDate };

export type CustomerNotice = {
  id: string;
  at: Instant;
  approvedBy: UserId;
  subject: string;
  body: string;
  published: PublishedSnapshot | null;
};

export type CustomerView = {
  shipmentId: ShipmentId;
  orderRef: string;
  consignee: { name: string; place: CustomerPlace };
  cargo: { description: string; packages: string; grossWeightKg: number };
  stage: Stage;
  verdict: Verdict;
  /** Set when the verdict is `on_hold`. */
  hold: HoldKind | null;
  committed: LocalDate;
  /** The destination zone: the committed and published days are local days there. */
  zone: Zone;
  published: CustomerPublished;
  reason: { from: "notice" | "fact"; text: string } | null;
  milestones: CustomerMilestone[];
  holds: { hold: HoldKind; since: Instant }[];
  identifiers: {
    container?: string;
    billOfLading?: string;
    vessel?: string;
    voyage?: string;
    portEta?: { place: CustomerPlace; when: CustomerStamp };
    incoterm: { code: Shipment["incoterm"]["code"]; place: string; consigneeClearsImport: boolean };
  };
  documents: { docType: DocumentType; fileName: string; at: Instant }[];
  /** Most recent first. */
  notices: CustomerNotice[];
  lastUpdateAt: Instant | null;
};

const HOLD_REASON: Record<HoldKind, string> = {
  customs: "Customs is holding the shipment for a check.",
  carrier: "The carrier is holding the shipment.",
};

function narrowPlace(place: CustomerPlace): CustomerPlace {
  return { name: place.name, country: place.country, zone: place.zone };
}

function narrowPublished(published: Published): CustomerPublished {
  switch (published.kind) {
    case "confirmed":
    case "planned":
      return published;
    case "estimated":
      return {
        kind: "estimated",
        day: published.day,
        at: published.at,
        precision: published.precision,
        by:
          published.by.kind === "carrier"
            ? { kind: "carrier" }
            : {
                kind: "notice",
                noticeId: published.by.noticeId,
                approvedBy: published.by.approvedBy,
              },
      };
    case "under_review":
      return { kind: "under_review", ...(published.was ? { was: published.was.day } : {}) };
  }
}

/** The door date on the delivery milestone is the published one, so the page never shows two. */
function doorStamp(published: CustomerPublished): CustomerStamp | null {
  if (published.kind === "under_review") return null;
  return { at: published.at, precision: published.precision, kind: published.kind };
}

function stampOf(
  entry: MilestoneEntry,
  published: CustomerPublished,
  now: Instant,
): CustomerStamp | null {
  if (entry.actual) {
    return { at: entry.actual.at, precision: entry.actual.precision, kind: "confirmed" };
  }
  if (entry.state === "not_reported") return null;
  if (entry.code === "DELIVERED") return doorStamp(published);
  if (entry.operatorEstimate) {
    return {
      at: entry.operatorEstimate.at,
      precision: entry.operatorEstimate.precision,
      kind: "estimated",
    };
  }
  // A plan that has already been missed says nothing true about the future: show no date.
  const { planned, place } = entry;
  if (planned && diffDays(localDate(now, place.zone), localDate(planned.at, place.zone)) >= 0) {
    return { at: planned.at, precision: planned.precision, kind: "planned" };
  }
  return null;
}

/**
 * The customer projection. Facts flow: operator-confirmed milestones, operator estimates and
 * confirmed holds appear as soon as they land. Predictions wait: an Estela estimate shows up only
 * as the snapshot of a notice that a named person approved.
 */
export function toCustomerView(input: {
  shipment: Shipment;
  timeline: Timeline;
  dates: ShipmentDates;
  health: Health;
  events: readonly LoggedEvent[];
  now: Instant;
}): CustomerView {
  const { shipment, timeline, dates, health, now } = input;
  const own = input.events.filter((event) => event.shipmentId === shipment.id);

  const published = narrowPublished(dates.published);
  const confirmedHolds = openHolds(timeline).filter((hold) => hold.reading !== "ai_pending");
  const hold = confirmedHolds[0]?.hold ?? null;
  const notices = noticesSent(own)
    .map((notice): CustomerNotice => ({
      id: notice.id,
      at: notice.at,
      approvedBy: notice.by,
      subject: notice.subject,
      body: notice.body,
      published: notice.published,
    }))
    .reverse();

  // First match wins. "On time" is reachable only with no open exception at all and with a date
  // to stand behind: no green lie, and no promise next to "date under review".
  let verdict: Verdict;
  if (dates.delivered) verdict = "delivered";
  else if (hold) verdict = "on_hold";
  else if (published.kind === "under_review") verdict = "in_progress";
  else if (diffDays(dates.committed, published.day) > 0) verdict = "delayed";
  else verdict = health === "on_time" ? "on_time" : "in_progress";

  // Only a verdict that raises a question gets a reason: an old notice does not explain "On time".
  let reason: CustomerView["reason"] = null;
  const latest = notices[0];
  if (verdict !== "delivered" && verdict !== "on_time") {
    if (latest) reason = { from: "notice", text: latest.subject };
    else if (hold) reason = { from: "fact", text: HOLD_REASON[hold] };
    else if (verdict === "delayed") {
      reason = { from: "fact", text: "The carrier has announced a later delivery date." };
    }
  }

  const milestones = milestonesOf(timeline)
    .filter((entry) => !entry.unplanned && CUSTOMER_MILESTONES.has(entry.code))
    .map((entry): CustomerMilestone => ({
      key: entry.key,
      code: entry.code,
      place: narrowPlace(entry.place),
      state: entry.state,
      when: stampOf(entry, published, now),
    }));

  const arrival = milestones.find((milestone) => milestone.code === "VESSEL_ARRIVED");
  const billOfLading = shipment.refs.find((ref) => ref.kind === "bill_of_lading")?.value;
  const container = shipment.cargo.container?.number;

  return {
    shipmentId: shipment.id,
    orderRef: shipment.orderRef,
    consignee: { name: shipment.consignee.name, place: narrowPlace(shipment.consignee.place) },
    cargo: {
      description: shipment.cargo.description,
      packages: shipment.cargo.packages,
      grossWeightKg: shipment.cargo.grossWeightKg,
    },
    stage: stageOf(timeline),
    verdict,
    hold: verdict === "on_hold" ? hold : null,
    committed: dates.committed,
    zone: dates.zone,
    published,
    reason,
    milestones,
    holds: confirmedHolds.map((entry) => ({ hold: entry.hold, since: entry.raised.at })),
    identifiers: {
      ...(container ? { container } : {}),
      ...(billOfLading ? { billOfLading } : {}),
      ...(shipment.voyage
        ? { vessel: shipment.voyage.vessel, voyage: shipment.voyage.voyage }
        : {}),
      ...(arrival?.when ? { portEta: { place: arrival.place, when: arrival.when } } : {}),
      incoterm: {
        code: shipment.incoterm.code,
        place: shipment.incoterm.place,
        // DAP and CPT both leave import clearance to the buyer, wherever there is a border to clear.
        consigneeClearsImport: shipment.sections.some(
          (section) => section.kind === "port" && section.gate === "import",
        ),
      },
    },
    documents: documentEvents(own)
      .filter((document) => document.customerVisible)
      .sort((a, b) => a.at - b.at)
      .map((document) => ({
        docType: document.docType,
        fileName: document.fileName,
        at: document.at,
      })),
    notices,
    lastUpdateAt: timeline.lastFactReceivedAt,
  };
}
