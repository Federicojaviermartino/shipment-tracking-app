import { clsx } from "clsx";
import { DateText } from "./date-stamp";
import type { Audience } from "./provenance";
import { type Rail, RailLine, TIMELINE_GRID } from "./timeline-rail";

export type TimelineNowData = {
  /** The entry the rule follows; `null` puts it before the first entry of the section. */
  after: string | null;
  /**
   * The current time where the reader is, with that place named: the rows around the rule
   * are each in the local time of their own place, so a bare clock would be read as one of
   * them. Operations read their site's time, a customer the consignee's.
   */
  clock?: { day: string; time: string; place: string; dateTime: string };
  /** An update is overdue: the rail up to this rule is drawn as unknown. */
  stale?: boolean;
};

type TimelineNowProps = Pick<TimelineNowData, "clock" | "stale"> & {
  audience: Audience;
  above: Rail;
  below: Rail;
};

/** The rule that splits what happened from what is expected. */
export function TimelineNow({ clock, stale = false, audience, above, below }: TimelineNowProps) {
  return (
    <li className={clsx("h-8", TIMELINE_GRID[audience])}>
      <div className="relative col-span-2 col-start-2">
        <RailLine rail={above} className="top-0 h-4" />
        <RailLine rail={below} className="top-4 bottom-0" />
        {/* The label starts on the text edge of the rows: 24px of rail and the 12px gap. */}
        <div className="absolute inset-x-0 top-0 flex h-8 items-center gap-2">
          <span aria-hidden="true" className="h-px w-7 shrink-0 bg-brand-600" />
          <p className="flex shrink-0 items-baseline gap-1.5 text-xs whitespace-nowrap">
            <span className="text-2xs font-semibold tracking-wider text-brand-700 uppercase">
              Now
            </span>
            {clock && (
              <>
                <DateText
                  day={clock.day}
                  time={clock.time}
                  precision="minute"
                  dateTime={clock.dateTime}
                  className="font-mono text-brand-700 tabular-nums"
                />
                <span className="text-ink-600">{clock.place}</span>
              </>
            )}
          </p>
          <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-brand-600" />
        </div>
        {stale && <p className="sr-only">No update since the entry above.</p>}
      </div>
    </li>
  );
}
