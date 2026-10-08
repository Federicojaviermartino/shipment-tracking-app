import type { EstelaEstimate } from "./estimate";
import { noticesSent, type LoggedEvent, type PublishedSnapshot } from "./log";
import {
  destinationZone,
  type MilestoneCode,
  type Shipment,
  type Source,
  type UserId,
} from "./shipment";
import {
  deliveryOf,
  milestonesOf,
  type Confirmed,
  type OperatorEstimate,
  type Stamp,
  type Timeline,
  type WithdrawnEstimate,
} from "./timeline";
import {
  diffDays,
  localDate,
  type Instant,
  type LocalDate,
  type Precision,
  type Zone,
} from "./time";

/** Something an operator said about an earlier milestone after it had declared the door date. */
export type UpstreamChange = {
  milestoneKey: string;
  code: MilestoneCode;
  kind: "confirmed" | "estimate";
  source: Source;
  receivedAt: Instant;
};

export type OperatorDoorEstimate = OperatorEstimate & {
  day: LocalDate;
  /**
   * The operator declared it before an upstream change that, by Estela's estimate, makes it too
   * early. It is still shown, with its age; it is never silently preferred.
   */
  superseded: boolean;
  supersededBy?: UpstreamChange;
};

export type Published =
  | { kind: "confirmed"; day: LocalDate; at: Instant; precision: Precision }
  | {
      kind: "estimated";
      day: LocalDate;
      at: Instant;
      precision: Precision;
      by:
        | { kind: "carrier"; source: Source; issuedAt: Instant }
        | { kind: "notice"; noticeId: string; approvedBy: UserId; issuedAt: Instant };
    }
  | { kind: "planned"; day: LocalDate; at: Instant; precision: Precision }
  | { kind: "under_review"; was?: { day: LocalDate; reason: "superseded" | "withdrawn" } };

export type ShipmentDates = {
  /** The destination zone: every day below is a local day there. */
  zone: Zone;
  committed: LocalDate;
  operator: OperatorDoorEstimate | null;
  withdrawn: (WithdrawnEstimate & { day: LocalDate }) | null;
  estela: EstelaEstimate | null;
  estelaDay: LocalDate | null;
  agreesWithOperator: boolean;
  delivered: (Stamp<Confirmed> & { day: LocalDate }) | null;
  /**
   * The best door date Estela can stand behind: the operator's unless superseded, else its own.
   * A customer notice communicates exactly this, so it is already shaped as the notice snapshot.
   */
  best: PublishedSnapshot | null;
  /** The delivery date the customer currently sees. */
  published: Published;
};

/** Every milestone is upstream of the door, and nothing was received after itself. */
function latestUpstreamChange(timeline: Timeline, after: Instant): UpstreamChange | undefined {
  const changes: UpstreamChange[] = [];
  for (const entry of milestonesOf(timeline)) {
    const stamps = [
      { kind: "confirmed" as const, stamp: entry.actual },
      { kind: "estimate" as const, stamp: entry.operatorEstimate },
    ];
    for (const { kind, stamp } of stamps) {
      if (!stamp || stamp.provenance.receivedAt <= after) continue;
      changes.push({
        milestoneKey: entry.key,
        code: entry.code,
        kind,
        source: stamp.provenance.source,
        receivedAt: stamp.provenance.receivedAt,
      });
    }
  }
  return changes.sort((a, b) => a.receivedAt - b.receivedAt).at(-1);
}

type PublishInput = {
  shipment: Shipment;
  timeline: Timeline;
  events: readonly LoggedEvent[];
  now: Instant;
  zone: Zone;
  delivered: ShipmentDates["delivered"];
  operator: OperatorDoorEstimate | null;
  withdrawn: ShipmentDates["withdrawn"];
};

/**
 * Facts flow, predictions wait: an operator's own estimate reaches the customer by itself, an
 * Estela estimate only inside a notice that a named person approved.
 */
function publish(input: PublishInput): Published {
  const { shipment, timeline, events, now, zone, delivered, operator, withdrawn } = input;
  if (delivered) {
    return {
      kind: "confirmed",
      day: delivered.day,
      at: delivered.at,
      precision: delivered.precision,
    };
  }

  const standing = operator && !operator.superseded ? operator : null;
  const notice = noticesSent(events)
    .filter((sent) => sent.shipmentId === shipment.id && sent.published !== null)
    .at(-1);

  if (notice?.published && (!standing || notice.at >= standing.provenance.receivedAt)) {
    return {
      kind: "estimated",
      day: notice.published.day,
      at: notice.published.at,
      precision: notice.published.precision,
      by: { kind: "notice", noticeId: notice.id, approvedBy: notice.by, issuedAt: notice.at },
    };
  }
  if (standing) {
    return {
      kind: "estimated",
      day: standing.day,
      at: standing.at,
      precision: standing.precision,
      by: {
        kind: "carrier",
        source: standing.provenance.source,
        issuedAt: standing.provenance.receivedAt,
      },
    };
  }
  if (operator) return { kind: "under_review", was: { day: operator.day, reason: "superseded" } };
  if (withdrawn) return { kind: "under_review", was: { day: withdrawn.day, reason: "withdrawn" } };

  // Nobody has declared a door date yet: the booking plan is all there is, and it is shown as
  // such for as long as it has not already been missed.
  const planned = deliveryOf(timeline)?.planned;
  if (planned && diffDays(localDate(now, zone), localDate(planned.at, zone)) >= 0) {
    return {
      kind: "planned",
      day: localDate(planned.at, zone),
      at: planned.at,
      precision: planned.precision,
    };
  }
  return { kind: "under_review" };
}

/**
 * The three dates of a shipment (committed, operator, Estela) and the published one. The estimate
 * is an argument: this module selects between what was said and computed, it never computes.
 */
export function selectDates(
  shipment: Shipment,
  timeline: Timeline,
  estimate: EstelaEstimate | null,
  events: readonly LoggedEvent[],
  now: Instant,
): ShipmentDates {
  const zone = destinationZone(shipment);
  const delivery = deliveryOf(timeline);
  const delivered = delivery?.actual
    ? { ...delivery.actual, day: localDate(delivery.actual.at, zone) }
    : null;

  const estela = delivered ? null : estimate;
  const estelaDay = estela && !estela.withheld ? localDate(estela.at, zone) : null;

  let operator: OperatorDoorEstimate | null = null;
  if (delivery?.operatorEstimate) {
    const declared = delivery.operatorEstimate;
    const day = localDate(declared.at, zone);
    const change = latestUpstreamChange(timeline, declared.provenance.receivedAt);
    const superseded = change !== undefined && estelaDay !== null && diffDays(day, estelaDay) > 0;
    operator = { ...declared, day, superseded, ...(superseded ? { supersededBy: change } : {}) };
  }

  const withdrawn = delivery?.withdrawnEstimate
    ? { ...delivery.withdrawnEstimate, day: localDate(delivery.withdrawnEstimate.at, zone) }
    : null;

  let best: PublishedSnapshot | null = null;
  if (operator && !operator.superseded) {
    best = {
      day: operator.day,
      at: operator.at,
      precision: operator.precision,
      basis: "operator_estimate",
    };
  } else if (estela && !estela.withheld && estelaDay) {
    best = { day: estelaDay, at: estela.at, precision: estela.precision, basis: "estela_estimate" };
  }

  return {
    zone,
    committed: shipment.committedDate,
    operator,
    withdrawn,
    estela,
    estelaDay,
    agreesWithOperator: operator !== null && estelaDay === operator.day,
    delivered,
    best,
    published: publish({ shipment, timeline, events, now, zone, delivered, operator, withdrawn }),
  };
}
