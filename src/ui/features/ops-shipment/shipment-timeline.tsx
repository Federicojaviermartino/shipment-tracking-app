import { Fragment, type ReactNode, useId } from "react";
import type { OpsShipmentView, TimelineEntryView } from "@/application/views";
import type { ShipmentId } from "@/domain/shipment";
import type { Instant } from "@/domain/time";
import { ConfirmReadingButton } from "@/ui/features/message-drawer/confirm-reading-button";
import { Card } from "@/ui/kit/card";
import { Lane } from "@/ui/kit/lane";
import { LegTimeline } from "@/ui/kit/leg-timeline";
import type { TimelineNowData } from "@/ui/kit/timeline-now";
import { deskClock } from "./desk";
import { entryAnchor, timelineRows } from "./timeline-entries";

/** The entry a line of the case panel sent the reader to. It flashes once per visit. */
export type PointedEntry = { anchor: string; visits: number };

// The header of a section arrives as one line; its lane is redrawn with the kit's arrow.
function SectionDetail({ text }: { text: string }) {
  return text.split(" · ").map((part, index) => {
    const [from, to] = part.split(" → ");
    return (
      <Fragment key={part}>
        {index > 0 && " · "}
        {from !== undefined && to !== undefined ? <Lane from={from} to={to} /> : part}
      </Fragment>
    );
  });
}

/**
 * Rejecting a reading is not final. Its note keeps the operator's message one click away, so
 * that is where the same reading can be confirmed after all.
 */
function reviewAgain(shipmentId: ShipmentId, entry: TimelineEntryView): ReactNode {
  if (entry.type !== "note" || entry.reading?.state !== "ai_rejected") {
    return undefined;
  }
  return (
    <ConfirmReadingButton
      shipmentId={shipmentId}
      eventKey={entry.reading.eventKey}
      accepted
      variant="link"
      disabledReason={entry.reading.disabledReason ?? undefined}
    >
      Confirm after all
    </ConfirmReadingButton>
  );
}

type ShipmentTimelineProps = {
  shipment: OpsShipmentView;
  now: Instant;
  pointed: PointedEntry | null;
};

/** Everything that happened and everything expected, section by section, around the "Now" rule. */
export function ShipmentTimeline({ shipment, now, pointed }: ShipmentTimelineProps) {
  const titleId = useId();
  const { timeline, dates, route, origin } = shipment;

  const rows = (entries: readonly TimelineEntryView[]) => {
    const actions = new Map(
      entries.map((entry) => [entryAnchor(entry.id), reviewAgain(shipment.id, entry)]),
    );
    return timelineRows(entries, { now, dates }).map((row) => ({
      ...row,
      action: actions.get(row.id),
      flashKey: row.id === pointed?.anchor ? pointed.visits : undefined,
    }));
  };
  const ruleIn = (sectionId: string | null): TimelineNowData | undefined =>
    timeline.now.sectionId === sectionId
      ? {
          after: timeline.now.afterEntryId && entryAnchor(timeline.now.afterEntryId),
          clock: deskClock(now),
          stale: timeline.now.stale,
        }
      : undefined;

  return (
    <Card as="section" aria-labelledby={titleId} className="px-6 pb-2">
      <h2 id={titleId} className="text-lg font-semibold">
        Timeline
      </h2>
      <div className="mt-1 flex flex-col gap-2">
        {/* What happened before the cargo moved belongs to the leg it was booked for. */}
        <LegTimeline
          audience="ops"
          mode={route.legs[0]?.mode ?? "road"}
          title="Booking"
          detail={origin.siteName}
          entries={rows(timeline.lead)}
          now={ruleIn(null)}
        />
        {timeline.sections.map((section) => (
          <LegTimeline
            key={section.id}
            audience="ops"
            mode={section.kind}
            title={section.title}
            detail={section.detail && <SectionDetail text={section.detail} />}
            entries={rows(section.entries)}
            now={ruleIn(section.id)}
          />
        ))}
      </div>
    </Card>
  );
}
