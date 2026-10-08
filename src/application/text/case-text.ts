import { assertNever } from "@/domain/assert-never";
import type { ShipmentException } from "@/domain/exceptions";
import { DESK_ZONE } from "@/domain/filters";
import { DOCUMENT_LABEL } from "@/domain/labels";
import { canPerform, CAPABILITY_REASON, type Capability, type Step } from "@/domain/playbook";
import { inScope, type InternalActor } from "@/domain/perimeter";
import type { ShipmentProjection } from "@/domain/projection";
import type { Deadline, DocumentType, Shipment } from "@/domain/shipment";
import { nextExpectation } from "@/domain/staleness";
import {
  diffDays,
  formatDay,
  formatStamp,
  HOUR,
  isPast,
  localDate,
  type Instant,
  type Zone,
} from "@/domain/time";
import { milestonesOf, openHolds, physicalProgress, type HoldEntry } from "@/domain/timeline";
import type { ReadContext } from "../context";
import { sourceName } from "../directory";
import type { ClockView } from "../views";
import {
  CHANNEL_WORD,
  days,
  list,
  lowerFirst,
  relativeDay,
  reportNoun,
  timeLeft,
  upperFirst,
  withoutFullStop,
} from "./format";

/**
 * The wording of a case: why it is in the queue, its title, its clock and its steps. The domain
 * decides that a case exists and gives name-free evidence; here the same structured data is put
 * into the sentences a desk reads, with operators called by name. Deterministic code: no model
 * writes any of this.
 */

function holdOf(projection: ShipmentProjection, exception: ShipmentException): HoldEntry | null {
  const kind = exception.type === "customs_hold" ? "customs" : "carrier";
  return openHolds(projection.timeline).find((hold) => hold.hold === kind) ?? null;
}

function channelWord(context: ReadContext, rawId: string): string {
  const raw = context.rawOf(rawId);
  return raw ? CHANNEL_WORD[raw.channel] : "message";
}

function committedPhrase(projection: ShipmentProjection, now: Instant): string {
  const { committed, zone } = projection.dates;
  return `Committed ${relativeDay(committed, localDate(now, zone))}.`;
}

/**
 * The deadline of the booking that a case's clock points at, when it points at one: "customer
 * not yet told" is a clock with no deadline behind it.
 */
export function deadlineBehind(
  shipment: Shipment,
  exception: ShipmentException,
): Deadline | undefined {
  const { actBy } = exception;
  if (!actBy) return undefined;
  return shipment.deadlines.find(
    (deadline) => deadline.at === actBy.at && deadline.label === actBy.label,
  );
}

function delayWhy(context: ReadContext, projection: ShipmentProjection): string {
  const { dates } = projection;
  const committed = formatDay(dates.committed);
  const { operator } = dates;
  if (operator && diffDays(dates.committed, operator.day) > 0) {
    const by = sourceName(context.directory, operator.provenance.source);
    const late = days(diffDays(dates.committed, operator.day));
    return `${by} declares delivery ${formatDay(operator.day)}, ${late} after the committed ${committed}.`;
  }
  const still = operator
    ? ` ${sourceName(context.directory, operator.provenance.source)} still declares ${formatDay(operator.day)}.`
    : " No new date has been declared.";
  return `The committed ${committed} has passed without a delivery.${still}`;
}

function predictedWhy(context: ReadContext, projection: ShipmentProjection): string {
  const { dates, timeline } = projection;
  const { operator, estelaDay } = dates;
  if (!estelaDay) return "Estela estimates a delivery after the committed date.";
  const name = (source: string) => sourceName(context.directory, source);
  const sentences: string[] = [];

  // What was last seen, and the report that should have followed it by now.
  const { last, next } = physicalProgress(timeline);
  const expected = next?.operatorEstimate ?? next?.planned;
  if (
    last?.actual &&
    next &&
    expected &&
    isPast(expected.at, expected.precision, context.now, next.place.zone)
  ) {
    const zone = last.place.zone;
    const where =
      last.code === "HUB_IN"
        ? `In the ${last.place.name} hub since ${formatStamp(last.actual.at, last.actual.precision, zone)}`
        : `${upperFirst(reportNoun(last.code))} at ${last.place.name} was ${formatStamp(last.actual.at, last.actual.precision, zone)}`;
    const missing = `${reportNoun(next.code)} planned for ${formatStamp(expected.at, expected.precision, next.place.zone)} never came`;
    sentences.push(`${where}; ${missing}.`);
  }

  const change = operator?.supersededBy;
  const moved = change
    ? milestonesOf(timeline).find((entry) => entry.key === change.milestoneKey)
    : undefined;
  if (change && moved) {
    const estimate = moved.operatorEstimate;
    sentences.push(
      change.kind === "estimate" && estimate
        ? `${name(change.source)} now estimates ${reportNoun(moved.code)} for ${formatStamp(estimate.at, estimate.precision, moved.place.zone)}.`
        : `${name(change.source)} confirmed ${reportNoun(moved.code)} later than planned.`,
    );
  }

  const late = days(diffDays(dates.committed, estelaDay));
  if (operator && !operator.superseded) {
    sentences.push(
      `${name(operator.provenance.source)} still says ${formatDay(operator.day)}; Estela estimates ${formatDay(estelaDay)}.`,
    );
  } else {
    const before = operator
      ? `; ${name(operator.provenance.source)}'s ${formatDay(operator.day)} was declared before that`
      : "";
    sentences.push(
      `Estela estimates delivery ${formatDay(estelaDay)}, ${late} after the committed ${formatDay(dates.committed)}${before}.`,
    );
  }
  return sentences.join(" ");
}

function holdWhy(
  context: ReadContext,
  projection: ShipmentProjection,
  exception: ShipmentException,
): string {
  const hold = holdOf(projection, exception);
  if (!hold) return "An operator is holding the goods.";
  const by = sourceName(context.directory, hold.raised.provenance.source);
  const reason = withoutFullStop(hold.reason);

  if (hold.hold === "carrier") {
    const { last } = physicalProgress(projection.timeline);
    const where = last ? ` at ${last.place.name}` : "";
    return `${by} holds the goods${where}: ${lowerFirst(reason)}. ${committedPhrase(projection, context.now)}`;
  }

  const message = `${by}'s ${channelWord(context, hold.raised.provenance.rawId)}`;
  switch (hold.reading) {
    case "ai_pending":
      return `Read by AI from ${message}: ${lowerFirst(reason)}.`;
    case "ai_accepted":
      return `Read by AI from ${message} and confirmed: ${lowerFirst(reason)}.`;
    case "table":
      return `${by} reports a customs hold: ${lowerFirst(reason)}.`;
    default:
      return assertNever(hold.reading);
  }
}

function cutoffWhy(
  context: ReadContext,
  projection: ShipmentProjection,
  exception: ShipmentException,
): string {
  const documents = exception.steps.filter((step) => step.kind === "send_document");
  const names = (steps: Step[]) =>
    upperFirst(list(steps.flatMap((step) => (step.docType ? [documentLabel(step.docType)] : []))));
  const forwarder = documents.find((step) => step.operatorId)?.operatorId;
  const who = forwarder ? sourceName(context.directory, forwarder) : "the forwarder";
  const missing = documents.filter((step) => step.state !== "done");
  const sent = documents.filter((step) => step.state === "done");

  const deadline = deadlineBehind(projection.shipment, exception);
  const cost = deadline?.consequence ? ` ${withoutFullStop(deadline.consequence)}.` : "";
  if (missing.length > 0) {
    return `${names(missing)} not on file, so ${who} cannot lodge the export declaration.${cost}`;
  }
  return `${names(sent)} sent to ${who}; the export release is not confirmed yet.${cost}`;
}

function staleWhy(context: ReadContext, projection: ShipmentProjection): string {
  const expectation = nextExpectation(projection.timeline);
  if (!expectation) return "An expected update is overdue.";
  const { reason } = expectation;
  if (reason.kind === "telematics_silence") {
    const hours = Math.floor((context.now - reason.lastSignalAt) / HOUR);
    return `No position from ${sourceName(context.directory, reason.source)} for ${hours} h on a truck that reports by telematics.`;
  }
  const { milestone, expected } = reason;
  const when = formatStamp(expected.at, expected.precision, milestone.place.zone);
  return `${upperFirst(reportNoun(milestone.code))} at ${milestone.place.name}, expected ${when}, has not been reported.`;
}

function documentLabel(docType: DocumentType): string {
  return DOCUMENT_LABEL[docType].toLowerCase();
}

/** The one line of "why it is here". */
export function whyLine(
  context: ReadContext,
  projection: ShipmentProjection,
  exception: ShipmentException,
): string {
  switch (exception.type) {
    case "delay":
      return delayWhy(context, projection);
    case "predicted_delay":
      return predictedWhy(context, projection);
    case "customs_hold":
    case "carrier_hold":
      return holdWhy(context, projection, exception);
    case "cutoff_risk":
      return cutoffWhy(context, projection, exception);
    case "stale":
      return staleWhy(context, projection);
    default:
      return assertNever(exception.type);
  }
}

/** The case in a few words, for the head of its panel. */
export function caseTitle(
  context: ReadContext,
  projection: ShipmentProjection,
  exception: ShipmentException,
): string {
  const { dates } = projection;
  switch (exception.type) {
    case "delay": {
      const late = dates.operator ? diffDays(dates.committed, dates.operator.day) : 0;
      return late > 0
        ? `Delayed: declared ${days(late)} after the committed date`
        : "Delayed: the committed date has passed";
    }
    case "predicted_delay": {
      const late = dates.estelaDay ? diffDays(dates.committed, dates.estelaDay) : 0;
      return `At risk: estimate ${days(late)} after the committed date`;
    }
    case "customs_hold":
      return exception.needsConfirmation
        ? "Held: customs hold, read by AI and not yet confirmed"
        : "Held: customs hold";
    case "carrier_hold":
      return "Held: carrier hold";
    case "cutoff_risk": {
      const left = exception.actBy ? exception.actBy.at - context.now : 0;
      return `At risk: export cut-off in ${timeLeft(left)}`;
    }
    case "stale": {
      const reason = nextExpectation(projection.timeline)?.reason;
      return reason?.kind === "telematics_silence"
        ? `Stale: ${Math.floor((context.now - reason.lastSignalAt) / HOUR)} h without a position`
        : "Stale: an expected update is overdue";
    }
    default:
      return assertNever(exception.type);
  }
}

/** What is left once every step is done and the rule still fires. */
export function waitingLine(exception: ShipmentException): string | null {
  if (exception.state !== "waiting") return null;
  const on: Record<ShipmentException["type"], string> = {
    customs_hold: "customs",
    carrier_hold: "the carrier",
    delay: "the delivery",
    predicted_delay: "the next operator update",
    cutoff_risk: "the export release",
    stale: "the operator's answer",
  };
  return `Your part is done. Waiting on ${on[exception.type]}.`;
}

function zoneOfDeadline(shipment: Shipment, milestoneKey: string | undefined): Zone {
  return shipment.plan.find((milestone) => milestone.key === milestoneKey)?.place.zone ?? DESK_ZONE;
}

/** The clock of a case: the deadline with a promise or money attached, as a desk says it. */
export function clockOf(
  shipment: Shipment,
  exception: ShipmentException,
  now: Instant,
): ClockView | null {
  const { actBy } = exception;
  if (!actBy) return null;
  const deadline = deadlineBehind(shipment, exception);
  if (!deadline) {
    return { kind: "now", at: actBy.at, zone: DESK_ZONE, label: "Now", detail: actBy.label };
  }

  const zone = zoneOfDeadline(shipment, deadline.milestoneKey);
  const left = deadline.at - now;
  const detail = `${deadline.label}, ${formatStamp(deadline.at, "minute", zone)}`;
  const base = { kind: deadline.kind, at: deadline.at, zone, detail };
  switch (deadline.kind) {
    case "next_departure":
      return { ...base, label: left > 0 ? `Act within ${timeLeft(left)}` : "Departure missed" };
    case "export_cutoff":
      return { ...base, label: left > 0 ? `Cut-off in ${timeLeft(left)}` : "Cut-off passed" };
    case "free_time_end":
      return { ...base, label: `Free time ends ${formatDay(localDate(deadline.at, zone))}` };
    default:
      return assertNever(deadline.kind);
  }
}

/** A step in full, and as the label of its button. */
export function stepText(
  context: ReadContext,
  projection: ShipmentProjection,
  exception: ShipmentException,
  step: Step,
): { label: string; action: string } {
  const operator = step.operatorId ? sourceName(context.directory, step.operatorId) : null;
  switch (step.kind) {
    case "confirm_reading": {
      const hold = holdOf(projection, exception);
      const from = hold
        ? `${sourceName(context.directory, hold.raised.provenance.source)}'s ${channelWord(context, hold.raised.provenance.rawId)}`
        : "the operator's message";
      return { label: `Confirm what the AI read in ${from}`, action: "Confirm reading" };
    }
    case "send_document": {
      const document = step.docType ? documentLabel(step.docType) : "document";
      const corrected = exception.type === "customs_hold" ? "corrected " : "";
      const short = step.docType === "commercial_invoice" ? "invoice" : document;
      return {
        label: `Send the ${corrected}${document} to ${operator ?? "the forwarder"}`,
        action: `Send ${short}`,
      };
    }
    case "contact_operator": {
      const whom = operator ?? "the operator";
      const ask: Record<ShipmentException["type"], string> = {
        carrier_hold: `Ask ${whom} to release what can move and to send photos`,
        predicted_delay: `Ask ${whom} to confirm before alarming the customer`,
        stale: `Ask ${whom} for position and ETA`,
        customs_hold: `Ask ${whom} for the status of the hold`,
        delay: `Ask ${whom} for the new delivery date`,
        cutoff_risk: `Ask ${whom} to confirm the export clearance`,
      };
      return { label: ask[exception.type], action: `Message ${whom}` };
    }
    case "notify_customer":
      return step.state === "outdated"
        ? { label: "Tell the customer the new date", action: "Review updated notice" }
        : { label: "Notify the customer", action: "Review notice" };
    default:
      return assertNever(step.kind);
  }
}

export const CONFIRM_READING_FIRST = "Confirm the AI reading first.";

/** "Needs the Logistics role. Ask Marta Soler.": the reason, and a colleague who can help. */
export function roleReason(context: ReadContext, shipment: Shipment, requires: Capability): string {
  const colleague = context.directory.actors.find(
    (candidate) =>
      candidate.kind === "internal" &&
      canPerform(candidate, requires) &&
      inScope(candidate, shipment),
  );
  return `${CAPABILITY_REASON[requires]}${colleague ? ` Ask ${colleague.name}.` : ""}`;
}

/**
 * Whether this actor may take the step now, and the reason shown when not. Role is the one place
 * where two people with the same perimeter differ; a step that rests on a reading nobody has
 * confirmed waits for the confirmation, whoever asks.
 */
export function permissionFor(
  context: ReadContext,
  actor: InternalActor,
  shipment: Shipment,
  exception: ShipmentException,
  step: Step,
): { allowed: boolean; disabledReason: string | null; why: "role" | "reading" | "done" | null } {
  if (!canPerform(actor, step.requires)) {
    return {
      allowed: false,
      disabledReason: roleReason(context, shipment, step.requires),
      why: "role",
    };
  }
  if (exception.needsConfirmation && step.kind !== "confirm_reading") {
    return { allowed: false, disabledReason: CONFIRM_READING_FIRST, why: "reading" };
  }
  if (step.state === "done") return { allowed: false, disabledReason: null, why: "done" };
  return { allowed: true, disabledReason: null, why: null };
}
