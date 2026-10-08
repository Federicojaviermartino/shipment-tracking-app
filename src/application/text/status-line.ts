import { assertNever } from "@/domain/assert-never";
import { HEALTH_LABEL, MILESTONE_LABEL } from "@/domain/labels";
import type { ShipmentProjection } from "@/domain/projection";
import type { ImportGateState } from "@/domain/stage";
import { diffDays, formatDay, formatStamp, localDate, type LocalDate } from "@/domain/time";
import {
  allEntries,
  findMilestone,
  physicalProgress,
  type MilestoneEntry,
  type PositionEntry,
} from "@/domain/timeline";
import type { ReadContext } from "../context";
import { sourceName } from "../directory";
import { whyLine } from "./case-text";
import { days } from "./format";

/**
 * Where a shipment is and when it arrives, in one or two sentences composed by code from the
 * stage and the three dates. Every date says where it comes from; nothing here is model output.
 */

const IMPORT_GATE_WORDS: Record<ImportGateState, string> = {
  not_lodged: "import entry not lodged yet",
  lodged: "import entry lodged",
  held: "held at import customs",
  released: "released by import customs",
};

function lastPosition(projection: ShipmentProjection): PositionEntry | undefined {
  return allEntries(projection.timeline)
    .filter((entry): entry is PositionEntry => entry.type === "position")
    .sort((a, b) => a.at - b.at)
    .at(-1);
}

function at(entry: MilestoneEntry, stamp: { at: number; precision: "minute" | "day" }): string {
  return formatStamp(stamp.at, stamp.precision, entry.place.zone);
}

function vesselWords(projection: ShipmentProjection): string | null {
  const { voyage } = projection.shipment;
  return voyage ? `${voyage.vessel} ${voyage.voyage}` : null;
}

/** What a row says under the stage: the vessel, the last place, the state of the import gate. */
export function stageDetail(projection: ShipmentProjection): string | null {
  const { timeline, stage } = projection;
  const { last } = physicalProgress(timeline);
  const vessel = vesselWords(projection);
  switch (stage) {
    case "booked": {
      const pickup = findMilestone(timeline, "PICKED_UP");
      return pickup?.planned ? `pickup planned ${at(pickup, pickup.planned)}` : null;
    }
    case "in_transit":
    case "out_for_delivery": {
      const position = lastPosition(projection);
      if (position && (!last?.actual || position.at >= last.actual.at)) {
        return `last position ${position.lastPlace}`;
      }
      return last ? `${MILESTONE_LABEL[last.code].toLowerCase()} · ${last.place.name}` : null;
    }
    case "at_origin_port":
      return vessel ? `booked on ${vessel}` : null;
    case "at_sea":
      return vessel ? `on ${vessel}` : null;
    case "at_destination_port":
      return projection.importGate ? IMPORT_GATE_WORDS[projection.importGate.state] : null;
    case "final_leg":
      return last ? `left ${last.place.name}` : null;
    case "delivered":
      return null;
    default:
      return assertNever(stage);
  }
}

function where(context: ReadContext, projection: ShipmentProjection): string {
  const { timeline, stage } = projection;
  const { last, next } = physicalProgress(timeline);
  const vessel = vesselWords(projection);
  switch (stage) {
    case "booked": {
      const pickup = findMilestone(timeline, "PICKED_UP");
      return pickup?.planned
        ? `Booked, pickup planned ${at(pickup, pickup.planned)} at ${pickup.place.name}`
        : "Booked";
    }
    case "in_transit": {
      const position = lastPosition(projection);
      if (position && (!last?.actual || position.at >= last.actual.at)) {
        return `In transit, last position ${position.lastPlace}`;
      }
      return last?.actual
        ? `In transit, last reported at ${last.place.name} ${at(last, last.actual)}`
        : "In transit";
    }
    case "at_origin_port":
      return `At the port of ${last?.place.name ?? "departure"}${vessel ? `, booked on ${vessel}` : ""}`;
    case "at_sea": {
      const expected = next?.operatorEstimate ?? next?.planned;
      const from = next?.operatorEstimate
        ? `operator estimate, ${sourceName(context.directory, next.operatorEstimate.provenance.source)}`
        : "planned";
      const due =
        next && expected
          ? `, due in ${next.place.name} ${formatDay(localDate(expected.at, next.place.zone))} (${from})`
          : "";
      return `At sea${vessel ? ` on ${vessel}` : ""}${due}`;
    }
    case "at_destination_port": {
      const gate = projection.importGate
        ? `, ${IMPORT_GATE_WORDS[projection.importGate.state]}`
        : "";
      return `At the port of ${last?.place.name ?? "arrival"}${gate}`;
    }
    case "final_leg":
      return `On the final leg from ${last?.place.name ?? "the port"}`;
    case "out_for_delivery":
      return last?.actual ? `Out for delivery since ${at(last, last.actual)}` : "Out for delivery";
    case "delivered":
      return "Delivered";
    default:
      return assertNever(stage);
  }
}

function againstCommitted(committed: LocalDate, day: LocalDate): string {
  const late = diffDays(committed, day);
  if (late > 0) return `${days(late)} after the committed date`;
  if (late < 0) return `${days(-late)} inside the committed date`;
  return "on the committed date";
}

function delivery(context: ReadContext, projection: ShipmentProjection): string {
  const { dates, shipment } = projection;
  const destination = shipment.consignee.place.name;
  if (dates.delivered) {
    const by = sourceName(context.directory, dates.delivered.provenance.source);
    const when = formatStamp(dates.delivered.at, dates.delivered.precision, dates.zone);
    return `Delivered in ${destination} ${when} (confirmed, ${by}), ${againstCommitted(dates.committed, dates.delivered.day)}.`;
  }
  if (dates.best) {
    const from =
      dates.best.basis === "operator_estimate" && dates.operator
        ? `operator estimate, ${sourceName(context.directory, dates.operator.provenance.source)}`
        : "Estela estimate";
    return `Delivery in ${destination} ${formatDay(dates.best.day)} (${from}), ${againstCommitted(dates.committed, dates.best.day)}.`;
  }
  if (dates.published.kind === "planned") {
    return `Delivery in ${destination} ${formatDay(dates.published.day)} (planned), ${againstCommitted(dates.committed, dates.published.day)}.`;
  }
  const reason = dates.estela?.withheld ? `: ${dates.estela.reason}` : " yet";
  return `No delivery estimate${reason}. Committed for ${formatDay(dates.committed)}.`;
}

/** The answer to "what's going on with this order?". */
export function statusLine(context: ReadContext, projection: ShipmentProjection): string {
  if (projection.dates.delivered) return delivery(context, projection);
  const sentences = [`${where(context, projection)}.`, delivery(context, projection)];
  const { primary } = projection;
  if (primary) {
    sentences.push(`${HEALTH_LABEL[primary.health]}: ${whyLine(context, projection, primary)}`);
  }
  return sentences.join(" ");
}

/** A delivered or open shipment in a few words, for a refusal that still names it. */
export function shortStatus(projection: ShipmentProjection): string {
  const { dates } = projection;
  return dates.delivered
    ? `delivered ${formatDay(dates.delivered.day)}`
    : `not delivered yet, committed for ${formatDay(dates.committed)}`;
}
