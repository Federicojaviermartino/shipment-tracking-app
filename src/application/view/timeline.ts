import { assertNever } from "@/domain/assert-never";
import { DESK_ZONE } from "@/domain/filters";
import { HOLD_LABEL, MILESTONE_LABEL } from "@/domain/labels";
import { internalEvents, operatorEvents, type LoggedEvent, type OperatorEvent } from "@/domain/log";
import type { ShipmentProjection } from "@/domain/projection";
import { originPlace, type Section, type Shipment } from "@/domain/shipment";
import type { Precision, Zone } from "@/domain/time";
import {
  physicalProgress,
  type NoteEntry,
  type ReadingState,
  type Timeline,
  type TimelineEntry,
} from "@/domain/timeline";
import type { ReadContext } from "../context";
import { sourceName, userName } from "../directory";
import { CHANNEL_LABEL } from "../text/format";
import type {
  RawMessageView,
  TimelineEntryView,
  TimelineSectionView,
  TimelineSourceView,
  TimelineView,
} from "../views";

const NOTE_STATUS_LABEL: Record<NonNullable<NoteEntry["status"]>, string> = {
  unauthorised: "Reported by a source that may not confirm this milestone",
  unmatched: "Refers to a milestone that is not in the plan",
  ai_pending: "Read by AI, not yet confirmed",
  ai_rejected: "AI reading rejected: shown as received",
};

export function rawMessageView(context: ReadContext, rawId: string): RawMessageView | null {
  const raw = context.rawOf(rawId);
  if (!raw) return null;
  return {
    id: raw.id,
    source: sourceName(context.directory, raw.operatorId),
    channel: raw.channel,
    channelLabel: CHANNEL_LABEL[raw.channel],
    receivedAt: raw.receivedAt,
    body: raw.body,
  };
}

/** The id an entry has in the page: what an evidence line points to. */
export function entryId(entry: TimelineEntry, sectionId: string | null): string {
  switch (entry.type) {
    case "milestone":
      return entry.key;
    case "hold":
      return `hold:${entry.eventKey}`;
    case "position":
      return `position:${sectionId ?? "lead"}`;
    case "note":
      return `note:${entry.eventKey}`;
    case "action":
      return `action:${entry.id}`;
    default:
      return assertNever(entry);
  }
}

/** Which entry shows the event with a given key. */
export function entryIdsByEventKey(timeline: Timeline): Map<string, string> {
  const ids = new Map<string, string>();
  const index = (entries: TimelineEntry[], sectionId: string | null) => {
    for (const entry of entries) {
      const id = entryId(entry, sectionId);
      if (entry.type === "milestone") {
        const keys = [
          ...entry.sources.map((source) => source.eventKey),
          entry.operatorEstimate?.eventKey,
          entry.withdrawnEstimate?.eventKey,
          entry.pendingReading?.eventKey,
        ];
        for (const key of keys) if (key) ids.set(key, id);
      } else if (entry.type === "hold" || entry.type === "note") {
        ids.set(entry.eventKey, id);
      }
    }
  };
  index(timeline.lead, null);
  for (const { section, entries } of timeline.sections) index(entries, section.id);
  return ids;
}

/** Who reviewed each model reading, by the key of the event that was read. */
export function reviewersOf(
  context: ReadContext,
  events: readonly LoggedEvent[],
): Map<string, string> {
  const reviewers = new Map<string, { at: number; by: string }>();
  for (const event of internalEvents(events)) {
    if (event.type !== "reading_reviewed") continue;
    const kept = reviewers.get(event.eventKey);
    if (!kept || event.at >= kept.at) reviewers.set(event.eventKey, { at: event.at, by: event.by });
  }
  return new Map(
    [...reviewers].map(([key, review]) => [key, userName(context.directory, review.by)]),
  );
}

function sectionZone(shipment: Shipment, section: Section | null): Zone {
  if (!section) return originPlace(shipment)?.zone ?? DESK_ZONE;
  return section.kind === "port" ? section.place.zone : section.from.zone;
}

function sectionHeader(
  context: ReadContext,
  shipment: Shipment,
  section: Section,
): Pick<TimelineSectionView, "title" | "detail"> {
  const { voyage } = shipment;
  switch (section.kind) {
    case "road":
      return {
        title: "Road",
        detail: `${sourceName(context.directory, section.operatorId)} · ${section.from.name} → ${section.to.name}`,
      };
    case "sea":
      return {
        title: "Sea",
        detail: [
          sourceName(context.directory, section.operatorId),
          voyage ? `${voyage.vessel} ${voyage.voyage}` : null,
          `${section.from.name} → ${section.to.name}`,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "port":
      return {
        title: `Port of ${section.place.name}`,
        detail: section.gate ? `${section.gate === "export" ? "Export" : "Import"} customs` : "",
      };
    default:
      return assertNever(section);
  }
}

/**
 * The timeline as operations read it: every entry with the people and the raw messages behind
 * it, and the place of the "Now" rule that splits what happened from what is expected.
 */
export function timelineView(
  context: ReadContext,
  projection: ShipmentProjection,
  events: readonly LoggedEvent[],
): TimelineView {
  const { shipment, timeline, dates } = projection;
  const stale = projection.exceptions.some((exception) => exception.type === "stale");
  const byKey = new Map<string, OperatorEvent>(
    operatorEvents(events).map((event) => [event.key, event]),
  );
  const reviewers = reviewersOf(context, events);
  const steps = dates.estela && !dates.estela.withheld ? dates.estela.steps : [];
  const current = physicalProgress(timeline).last;
  const currentSection =
    timeline.sections.find(({ entries }) => current && entries.includes(current))?.section ?? null;

  const precisionOf = (eventKey: string, fallback: Precision): Precision =>
    byKey.get(eventKey)?.precision ?? fallback;
  const reading = (state: ReadingState, eventKey: string) => ({
    state,
    reviewedBy: reviewers.get(eventKey) ?? null,
  });
  const sourceView = (
    source: { source: string; rawId: string; at: number },
    precision: Precision,
    zone: Zone,
  ): TimelineSourceView => ({
    operatorId: source.source,
    name: sourceName(context.directory, source.source),
    when: { at: source.at, precision, zone },
    original: rawMessageView(context, source.rawId),
  });

  const toView = (entry: TimelineEntry, section: Section | null): TimelineEntryView => {
    const id = entryId(entry, section?.id ?? null);
    const zone = sectionZone(shipment, section);
    switch (entry.type) {
      case "milestone": {
        const place = entry.place.zone;
        const estimate = entry.operatorEstimate;
        const taken = entry.withdrawnEstimate;
        const step = entry.actual ? undefined : steps.find((s) => s.milestoneKey === entry.key);
        const authority = entry.sources[0];
        return {
          type: "milestone",
          id,
          code: entry.code,
          label: MILESTONE_LABEL[entry.code],
          place: { name: entry.place.name, country: entry.place.country, zone: place },
          state: entry.state,
          unplanned: entry.unplanned === true,
          actual: entry.actual
            ? { at: entry.actual.at, precision: entry.actual.precision, zone: place }
            : null,
          operatorEstimate: estimate
            ? {
                when: { at: estimate.at, precision: estimate.precision, zone: place },
                by: sourceName(context.directory, estimate.provenance.source),
                declaredAt: estimate.provenance.receivedAt,
                remark: estimate.remark ?? null,
                original: rawMessageView(context, estimate.provenance.rawId),
              }
            : null,
          withdrawn: taken
            ? {
                when: { at: taken.at, precision: taken.precision, zone: place },
                by: sourceName(context.directory, taken.provenance.source),
                at: taken.withdrawnAt,
              }
            : null,
          planned: entry.planned
            ? { at: entry.planned.at, precision: entry.planned.precision, zone: place }
            : null,
          estela: step ? { at: step.at, precision: step.precision, zone: place } : null,
          sources: entry.sources.map((source) =>
            sourceView(source, precisionOf(source.eventKey, "minute"), place),
          ),
          reading: entry.reading
            ? reading(
                entry.reading,
                entry.pendingReading?.eventKey ?? authority?.eventKey ?? entry.key,
              )
            : null,
        };
      }
      case "hold": {
        const raised = {
          source: entry.raised.provenance.source,
          rawId: entry.raised.provenance.rawId,
          at: entry.raised.at,
        };
        return {
          type: "hold",
          id,
          hold: entry.hold,
          label: HOLD_LABEL[entry.hold].ops,
          open: entry.open,
          reason: entry.reason,
          raised: { at: entry.raised.at, precision: entry.raised.precision, zone },
          clearedAt: entry.clearedAt ?? null,
          reading: reading(entry.reading, entry.eventKey),
          source: sourceView(raised, entry.raised.precision, zone),
        };
      }
      case "position":
        return {
          type: "position",
          id,
          lastPlace: entry.lastPlace,
          count: entry.count,
          stale: stale && section?.id === currentSection?.id,
          source: sourceView(entry, "minute", zone),
        };
      case "note":
        return {
          type: "note",
          id,
          text: entry.text,
          status: entry.status ?? null,
          statusLabel: entry.status ? NOTE_STATUS_LABEL[entry.status] : null,
          source: sourceView(entry, precisionOf(entry.eventKey, "minute"), zone),
        };
      case "action":
        return {
          type: "action",
          id,
          label: entry.label,
          by: userName(context.directory, entry.by),
          when: { at: entry.at, precision: "minute", zone: DESK_ZONE },
        };
      default:
        return assertNever(entry);
    }
  };

  // The rule goes after the last thing that happened in the section the cargo is in.
  const happened = (entry: TimelineEntry) =>
    entry.type !== "milestone" || entry.state === "done" || entry.state === "not_reported";
  const currentEntries = currentSection
    ? (timeline.sections.find(({ section }) => section.id === currentSection.id)?.entries ?? [])
    : timeline.lead;
  const lastHappened = currentEntries.findLast(happened);

  return {
    lead: timeline.lead.map((entry) => toView(entry, null)),
    sections: timeline.sections.map(({ section, entries }) => ({
      id: section.id,
      kind: section.kind,
      ...sectionHeader(context, shipment, section),
      entries: entries.map((entry) => toView(entry, section)),
    })),
    now: {
      sectionId: currentSection?.id ?? null,
      afterEntryId: lastHappened ? entryId(lastHappened, currentSection?.id ?? null) : null,
      stale,
    },
  };
}
