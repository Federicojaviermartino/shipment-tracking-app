import { HOLD_LABEL, MILESTONE_LABEL, plural } from "@/domain/labels";
import type { OperatorEvent } from "@/domain/log";
import type { ShipmentProjection } from "@/domain/projection";
import type { ShipmentId } from "@/domain/shipment";
import { diffDays, formatDay, localDate } from "@/domain/time";
import { milestonesOf } from "@/domain/timeline";
import { list, lowerFirst, withoutFullStop } from "./format";

/**
 * What an operator update says, in the one line of a toast. When a message carries several
 * things, the one that matters most to a desk is the headline: a hold before a date, a date
 * before a scan.
 */

function weight(event: OperatorEvent): number {
  const { fact } = event;
  switch (fact.type) {
    case "hold":
      return fact.state === "raised" ? 0 : 1;
    case "estimate":
      return fact.code === "DELIVERED" ? 3 : 2;
    case "estimate_withdrawn":
      return 3;
    case "milestone":
      return 4;
    case "position":
      return 5;
    case "note":
      return 6;
  }
}

/** The first sentence of an operator's remark, as it was written. */
function firstSentence(remark: string): string {
  return withoutFullStop(remark.split(/(?<=\.)\s/)[0] ?? remark);
}

/** An estimate that repeats the day the operator had already declared is not news. */
function restates(
  event: OperatorEvent,
  before: ReadonlyMap<ShipmentId, ShipmentProjection>,
): boolean {
  const { fact } = event;
  if (fact.type !== "estimate") return false;
  const shipment = before.get(event.shipmentId);
  const declared = shipment
    ? milestonesOf(shipment.timeline).find((entry) => entry.code === fact.code && !entry.unplanned)
        ?.operatorEstimate
    : undefined;
  const { zone } = fact.place;
  return declared !== undefined && localDate(declared.at, zone) === localDate(fact.at, zone);
}

/**
 * `events` are the new operator events the listener may see; `before` holds each shipment as it
 * stood without them, which is what "2 days later" is measured against.
 */
export function feedHeadline(
  events: readonly OperatorEvent[],
  before: ReadonlyMap<ShipmentId, ShipmentProjection>,
): string {
  const news = events.filter((event) => !restates(event, before));
  const told = news.length > 0 ? news : events;
  const lead = [...told].sort((a, b) => weight(a) - weight(b))[0];
  if (!lead) return "New operator update";
  const alike = told.filter(
    (event) => weight(event) === weight(lead) && event.fact.type === lead.fact.type,
  );
  const ids = list([...new Set(alike.map((event) => event.shipmentId))]);
  const { fact } = lead;

  switch (fact.type) {
    case "hold":
      return fact.state === "raised"
        ? `${HOLD_LABEL[fact.hold].ops} on ${ids}: ${lowerFirst(withoutFullStop(fact.reason))}`
        : `${HOLD_LABEL[fact.hold].ops} on ${ids} cleared`;
    case "estimate": {
      const day = localDate(fact.at, fact.place.zone);
      if (fact.code === "DELIVERED") return `Delivery of ${ids} now declared for ${formatDay(day)}`;

      const shipment = before.get(lead.shipmentId);
      const entry = shipment
        ? milestonesOf(shipment.timeline).find(
            (candidate) => candidate.code === fact.code && !candidate.unplanned,
          )
        : undefined;
      const was = entry?.operatorEstimate ?? entry?.planned;
      const moved = was ? diffDays(localDate(was.at, fact.place.zone), day) : 0;
      const shift =
        moved > 0
          ? `, ${plural(moved, "day")} later`
          : moved < 0
            ? `, ${plural(-moved, "day")} earlier`
            : "";
      const vessel = shipment?.shipment.voyage?.vessel;
      const subject =
        fact.code === "VESSEL_ARRIVED" && vessel
          ? `${vessel} now due in ${fact.place.name}`
          : `${MILESTONE_LABEL[fact.code]} at ${fact.place.name} now expected`;
      const remark = fact.remark ? ` (${firstSentence(fact.remark)})` : "";
      return `${subject} ${formatDay(day)}${shift}${remark}`;
    }
    case "estimate_withdrawn":
      return `Delivery estimate withdrawn for ${ids}`;
    case "milestone":
      return `${MILESTONE_LABEL[fact.code]} at ${fact.place.name}: ${ids}`;
    case "position":
      return `${ids} reported at ${fact.place}`;
    case "note":
      return `Remark on ${ids}`;
  }
}

export function feedSentence(notice: {
  operatorName: string;
  headline: string;
  affected: number;
  needNotice: number;
  resolved: readonly ShipmentId[];
}): string {
  const need =
    notice.needNotice > 0
      ? `, ${notice.needNotice} need${notice.needNotice === 1 ? "s" : ""} a customer notice`
      : "";
  const resolved =
    notice.resolved.length > 0 ? ` Resolved by operator update: ${list(notice.resolved)}.` : "";
  return `${notice.operatorName}: ${notice.headline}. ${plural(notice.affected, "shipment")} affected${need}.${resolved}`;
}
