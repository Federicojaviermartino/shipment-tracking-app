import type { PortalShipmentView } from "@/application/views";
import type { Instant, Zone } from "@/domain/time";
import { dateValue } from "@/ui/format/when";
import { type ProvenanceKind, provenanceWords } from "@/ui/kit/provenance";
import type { TimelineEntryData } from "@/ui/kit/timeline-entry";
import type { TimelineNowData } from "@/ui/kit/timeline-now";
import { publishedKind } from "./published-kind";

type Milestone = PortalShipmentView["milestones"][number];
type Hold = PortalShipmentView["holds"][number];
type NowClock = NonNullable<TimelineNowData["clock"]>;

// An entry id becomes a DOM id, which cannot hold the spaces of a place name.
function entryId(key: string) {
  return key.replaceAll(" ", "-");
}

// The delivery milestone carries the published date, which may be the desk's own estimate from
// an approved notice. Every other estimate a customer sees is the carrier's.
function stampKind(
  milestone: Milestone,
  kind: NonNullable<Milestone["when"]>["kind"],
  published: PortalShipmentView["published"],
): ProvenanceKind {
  if (kind !== "estimated") return kind;
  return milestone.code === "DELIVERED" && published.kind === "estimated"
    ? publishedKind(published)
    : "declared";
}

function milestoneEntry(
  milestone: Milestone,
  published: PortalShipmentView["published"],
): TimelineEntryData {
  const { label, place, when } = milestone;
  const id = entryId(milestone.key);

  // No source, no value: a milestone nobody dated says so instead of showing a time.
  if (when === null) {
    return milestone.state === "not_reported"
      ? { id, mark: "unreported", label, detail: place.name }
      : { id, mark: "planned", label, detail: `No estimate yet · ${place.name}` };
  }

  const kind = stampKind(milestone, when.kind, published);
  const { by } = provenanceWords(kind, "customer");
  return {
    id,
    mark: kind,
    label,
    when: dateValue(when),
    detail: by ? `${by} · ${place.name}` : place.name,
  };
}

// A hold arrives as an instant with no place of its own, so it is shown as a day.
function holdEntry(hold: Hold, zone: Zone): TimelineEntryData {
  return {
    id: `hold-${hold.hold}`,
    mark: "hold",
    label: hold.label,
    when: dateValue({ at: hold.since, precision: "day", zone }),
    detail: "Confirmed",
  };
}

/** The time on the "Now" rule: the consignee's, named, because every row is local to its place. */
export function consigneeClock(shipment: PortalShipmentView, now: Instant): NowClock {
  const here = dateValue({ at: now, precision: "minute", zone: shipment.zone });
  return {
    day: here.day,
    time: here.time ?? "",
    place: shipment.destination,
    dateTime: here.dateTime,
  };
}

type CustomerTimeline = {
  entries: TimelineEntryData[];
  /** Absent once the shipment is delivered: everything is behind the rule. */
  now?: TimelineNowData;
};

/**
 * The customer's milestones as one timeline. An open hold stands where the cargo is: right after
 * the last milestone it reached, in that place's local time, with the "Now" rule under it.
 */
export function customerTimeline(shipment: PortalShipmentView, clock?: NowClock): CustomerTimeline {
  const { milestones, holds } = shipment;
  // A customs entry can be lodged ahead of the cargo: what is done after a milestone still to
  // come is not where the cargo has got to.
  const ahead = milestones.findIndex(({ state }) => state === "next" || state === "upcoming");
  const reached = milestones
    .slice(0, ahead === -1 ? milestones.length : ahead)
    .findLastIndex((milestone) => milestone.state === "done");
  const zone = milestones[reached]?.place.zone ?? shipment.zone;

  const entries = milestones.map((milestone) => milestoneEntry(milestone, shipment.published));
  entries.splice(reached + 1, 0, ...holds.map((hold) => holdEntry(hold, zone)));

  if (shipment.route.position === null) {
    return { entries };
  }
  return { entries, now: { after: entries[reached + holds.length]?.id ?? null, clock } };
}
