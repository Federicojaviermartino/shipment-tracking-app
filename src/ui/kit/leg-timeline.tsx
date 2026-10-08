import { Anchor, Ship, Truck } from "lucide-react";
import { type ReactNode, useId } from "react";
import { assertNever } from "./assert-never";
import type { Audience } from "./provenance";
import type { StrokeKind } from "./stroke";
import { isUnconfirmedHold, TimelineEntry, type TimelineEntryData } from "./timeline-entry";
import { TimelineNow, type TimelineNowData } from "./timeline-now";
import { NO_RAIL, type Rail } from "./timeline-rail";

const MODE_ICON = {
  road: Truck,
  sea: Ship,
  port: Anchor,
} as const;

type LegTimelineProps = {
  /** Operations get compact rows and the raw messages; a customer gets larger, plainer rows. */
  audience: Audience;
  mode: keyof typeof MODE_ICON;
  /** The section in a word or two: "Sea", "Port of Veracruz". */
  title: string;
  /** Who and what carries it, and between which places (a `Lane`). */
  detail?: ReactNode;
  entries: readonly TimelineEntryData[];
  /** Where the "Now" rule falls, when it falls inside this section. */
  now?: TimelineNowData;
};

// The rail takes the stroke of the provenance it leads into. Anything that is not an
// expected milestone already happened, so the way to it is the solid track; the exception
// is a hold that only a model has read, which is still something the model says.
function strokeInto(entry: TimelineEntryData): StrokeKind {
  const { mark } = entry;
  switch (mark) {
    case "declared":
    case "estimated":
      return mark;
    case "planned":
    case "committed":
      return "planned";
    case "hold":
      return isUnconfirmedHold(entry) ? "estimated" : "confirmed";
    case "confirmed":
    case "unreported":
    case "position":
    case "stale_position":
    case "note":
    case "action":
      return "confirmed";
    default:
      return assertNever(mark);
  }
}

type Row = { type: "entry"; entry: TimelineEntryData } | { type: "now"; now: TimelineNowData };

function railInto(row: Row | undefined): Rail {
  if (!row) {
    return NO_RAIL;
  }
  if (row.type === "now") {
    return { stretch: row.now.stale ? "unknown" : "confirmed" };
  }
  return { stretch: strokeInto(row.entry), muted: row.entry.superseded };
}

/**
 * One section of a shipment's journey: a header and its entries in plan order, on a rail
 * that speaks the provenance grammar. The same data renders for both audiences.
 */
export function LegTimeline({ audience, mode, title, detail, entries, now }: LegTimelineProps) {
  const headingId = useId();
  const Icon = MODE_ICON[mode];

  const rows: Row[] = entries.map((entry) => ({ type: "entry", entry }));
  if (now) {
    const index = now.after === null ? 0 : entries.findIndex((entry) => entry.id === now.after) + 1;
    rows.splice(index, 0, { type: "now", now });
  }

  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="flex h-10 items-center gap-2 border-b border-line text-sm text-ink-600"
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="font-semibold text-ink-900">{title}</span>
        {detail && <span className="min-w-0 truncate">{detail}</span>}
      </h3>
      <ol className="py-2">
        {rows.map((row, index) => {
          const above = index === 0 ? NO_RAIL : railInto(row);
          const below = railInto(rows[index + 1]);
          return row.type === "now" ? (
            <TimelineNow
              key="now"
              clock={row.now.clock}
              stale={row.now.stale}
              audience={audience}
              above={above}
              below={below}
            />
          ) : (
            <TimelineEntry
              key={row.entry.id}
              entry={row.entry}
              audience={audience}
              above={above}
              below={below}
            />
          );
        })}
      </ol>
    </section>
  );
}
