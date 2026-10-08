import { assertNever } from "./assert-never";
import { defaultFileName, isCustomerVisible } from "./documents";
import { MILESTONE_LABEL } from "./labels";
import type { DocumentEvent, Fact, OperatorEvent, RawMessage, Reading } from "./log";
import {
  milestoneKey,
  placeKey,
  type DocumentType,
  type HoldKind,
  type MilestoneCode,
  type OperatorId,
  type Place,
  type Shipment,
} from "./shipment";
import type { Instant, Precision } from "./time";

/** How a message says which cargo it is about. A vessel event names no shipment at all. */
export type Correlation =
  { by: "reference"; value: string } | { by: "voyage"; vessel: string; voyage: string };

/**
 * What an operator said, in Estela's vocabulary, before anybody knows which shipment it is about.
 * A place is present only when the operator named the place of the milestone itself: a forwarder's
 * status report names none, and a haulier's "new delivery date" is keyed wherever the clerk sits.
 */
export type Observation =
  | { type: "milestone"; code: MilestoneCode; place?: Place }
  | {
      type: "estimate";
      code: MilestoneCode;
      place?: Place;
      at: Instant;
      precision: Precision;
      remark?: string;
    }
  | { type: "estimate_withdrawn"; code: MilestoneCode; place?: Place; remark?: string }
  | { type: "hold"; hold: HoldKind; state: "raised" | "cleared"; reason: string }
  | { type: "position"; place: string }
  | { type: "note"; text: string }
  | { type: "document"; docType: DocumentType };

/**
 * One thing an operator adapter found in a raw message. `occurredAt` is absent when the message
 * does not say when: the receipt time then stands in. Free text is handed over unread.
 */
export type ParsedItem =
  | {
      kind: "observation";
      ref: Correlation;
      observation: Observation;
      occurredAt?: Instant;
      precision?: Precision;
      rule: string;
    }
  | { kind: "free_text"; ref: Correlation; text: string };

export type ParseResult = { ok: true; items: ParsedItem[] } | { ok: false; reason: string };

function sameText(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/**
 * The shipments a message is about. A reference attaches only to the shipment that holds that
 * exact reference from that operator; a vessel event fans out to every shipment aboard. An empty
 * result is an orphan: nothing is ever attached by guess.
 */
export function correlate(
  shipments: readonly Shipment[],
  operatorId: OperatorId,
  ref: Correlation,
): Shipment[] {
  if (ref.by === "voyage") {
    return shipments.filter(
      (shipment) =>
        shipment.voyage !== undefined &&
        sameText(shipment.voyage.vessel, ref.vessel) &&
        sameText(shipment.voyage.voyage, ref.voyage),
    );
  }
  return shipments.filter((shipment) =>
    shipment.refs.some((held) => held.operatorId === operatorId && held.value === ref.value),
  );
}

export type Ingested = {
  events: (OperatorEvent | DocumentEvent)[];
  /** Free text that a table cannot read, tied to its shipment and waiting for the text interpreter. */
  unread: { shipment: Shipment; ref: Correlation; text: string }[];
  /** Items whose reference matches no shipment. They are kept apart, never attached. */
  orphans: ParsedItem[];
};

/**
 * Correlates what an adapter found in one raw message and turns every table-mapped item into a
 * logged event per shipment it concerns.
 */
export function ingestItems(
  shipments: readonly Shipment[],
  raw: Pick<RawMessage, "id" | "operatorId" | "receivedAt">,
  items: readonly ParsedItem[],
): Ingested {
  const result: Ingested = { events: [], unread: [], orphans: [] };
  for (const item of items) {
    const concerned = correlate(shipments, raw.operatorId, item.ref);
    if (concerned.length === 0) {
      result.orphans.push(item);
      continue;
    }
    for (const shipment of concerned) {
      if (item.kind === "free_text") {
        result.unread.push({ shipment, ref: item.ref, text: item.text });
        continue;
      }
      result.events.push(
        toLoggedEvent({
          shipment,
          raw,
          ref: item.ref,
          observation: item.observation,
          ...(item.occurredAt !== undefined ? { occurredAt: item.occurredAt } : {}),
          ...(item.precision !== undefined ? { precision: item.precision } : {}),
          reading: { method: "table", rule: item.rule },
        }),
      );
    }
  }
  return result;
}

/** The place of the planned milestone the operator means, or nothing when the plan cannot say. */
function plannedPlace(
  shipment: Shipment,
  code: MilestoneCode,
  stated: Place | undefined,
): Place | undefined {
  const candidates = shipment.plan.filter((milestone) => milestone.code === code);
  if (stated) {
    return candidates.find((milestone) => placeKey(milestone.place) === placeKey(stated))?.place;
  }
  return candidates.length === 1 ? candidates[0]?.place : undefined;
}

function toFact(shipment: Shipment, observation: Exclude<Observation, { type: "document" }>): Fact {
  switch (observation.type) {
    case "milestone": {
      // A stated place that is not in the plan is still a fact: an unplanned stop.
      const place =
        plannedPlace(shipment, observation.code, observation.place) ?? observation.place;
      if (place) return { type: "milestone", code: observation.code, place };
      return {
        type: "note",
        text: `${MILESTONE_LABEL[observation.code]} reported without a place that matches the plan`,
      };
    }
    case "estimate": {
      const place = plannedPlace(shipment, observation.code, observation.place);
      if (!place) {
        return {
          type: "note",
          text: `Estimate for a milestone that is not in the plan: ${MILESTONE_LABEL[observation.code].toLowerCase()}`,
        };
      }
      return {
        type: "estimate",
        code: observation.code,
        place,
        at: observation.at,
        precision: observation.precision,
        ...(observation.remark ? { remark: observation.remark } : {}),
      };
    }
    case "estimate_withdrawn": {
      const place = plannedPlace(shipment, observation.code, observation.place);
      if (!place) {
        return {
          type: "note",
          text: `Estimate withdrawn for a milestone that is not in the plan: ${MILESTONE_LABEL[observation.code].toLowerCase()}`,
        };
      }
      return {
        type: "estimate_withdrawn",
        code: observation.code,
        place,
        ...(observation.remark ? { remark: observation.remark } : {}),
      };
    }
    case "hold":
    case "position":
    case "note":
      return observation;
    default:
      return assertNever(observation);
  }
}

/** FNV-1a: enough to tell two remarks apart inside an idempotency key. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

function signature(fact: Fact): string {
  switch (fact.type) {
    case "milestone":
      return `milestone:${milestoneKey(fact.code, fact.place)}`;
    case "estimate":
      return `estimate:${milestoneKey(fact.code, fact.place)}:${fact.at}`;
    case "estimate_withdrawn":
      return `withdrawn:${milestoneKey(fact.code, fact.place)}`;
    case "hold":
      return `hold:${fact.hold}:${fact.state}`;
    case "position":
      return `position:${fact.place}`;
    case "note":
      return `note:${hash(fact.text)}`;
    default:
      return assertNever(fact);
  }
}

function refKey(ref: Correlation): string {
  return ref.by === "voyage" ? `${ref.vessel}/${ref.voyage}` : ref.value;
}

/**
 * Ties one observation to one shipment and gives it its idempotency key, so that the same message
 * delivered twice produces the same event twice and the store keeps one.
 */
export function toLoggedEvent(input: {
  shipment: Shipment;
  raw: Pick<RawMessage, "id" | "operatorId" | "receivedAt">;
  ref: Correlation;
  observation: Observation;
  occurredAt?: Instant;
  precision?: Precision;
  reading: Reading;
}): OperatorEvent | DocumentEvent {
  const { shipment, raw, observation, reading } = input;
  const occurredAt = input.occurredAt ?? raw.receivedAt;
  const precision = input.occurredAt === undefined ? "minute" : (input.precision ?? "minute");
  const prefix = `${raw.operatorId}|${refKey(input.ref)}|${shipment.id}`;

  if (observation.type === "document") {
    return {
      kind: "document",
      id: `${prefix}|document:${observation.docType}|${occurredAt}`,
      shipmentId: shipment.id,
      at: occurredAt,
      source: raw.operatorId,
      rawId: raw.id,
      docType: observation.docType,
      fileName: defaultFileName(observation.docType, shipment),
      customerVisible: isCustomerVisible(observation.docType),
    };
  }

  const fact = toFact(shipment, observation);
  return {
    kind: "operator",
    key: `${prefix}|${signature(fact)}|${occurredAt}`,
    shipmentId: shipment.id,
    source: raw.operatorId,
    rawId: raw.id,
    fact,
    occurredAt,
    precision,
    receivedAt: raw.receivedAt,
    reading,
  };
}
