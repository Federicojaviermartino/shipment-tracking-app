import { clsx } from "clsx";
import type { ReactNode } from "react";
import { AiMark } from "./ai-mark";
import type { AiReading } from "./ai-words";
import { assertNever } from "./assert-never";
import { DateText, type DateValue } from "./date-stamp";
import { Disclosure, DisclosureContent, DisclosureTrigger } from "./disclosure";
import { FlashItem } from "./flash-item";
import { PositionMarker } from "./position-marker";
import { type Audience, provenanceCaption, type ProvenanceKind } from "./provenance";
import { ProvenanceMark } from "./provenance-mark";
import { type OriginalMessage, OriginalMessages } from "./show-original";
import { StatusGlyph } from "./status-glyph";
import { Tag } from "./tag";
import { type Rail, RailLine, TIMELINE_GRID } from "./timeline-rail";

/**
 * What sits on the rail: the provenance of a milestone's date, or one of the entries that
 * are not milestones. `stale_position` is a last known position that is overdue an update;
 * a `note` (an operator remark that maps to no milestone) is drawn as lines of text and an
 * `action` (something our own people did) as an outgoing arrow.
 */
export type TimelineMark =
  ProvenanceKind | "unreported" | "hold" | "position" | "stale_position" | "note" | "action";

export type TimelineEntryData = {
  /** Unique in the page: it is the row's anchor for "scroll to this entry". */
  id: string;
  mark: TimelineMark;
  label: string;
  /** After the provenance words: source and age. For other entries, the whole caption. */
  detail?: string;
  /** Local time of the entry's place. Absent when nobody reported or planned one. */
  when?: DateValue;
  /** The date was overtaken by newer information: struck through, with `detail` saying why. */
  superseded?: boolean;
  /** The value this one replaced, struck through at the end of the caption. */
  was?: DateValue;
  /**
   * A model read the entry from free text. Operations see the tag; until a person has
   * confirmed the reading, a hold is not a fact and is drawn hollow on a dotted rail.
   */
  reading?: AiReading;
  /** How many operators reported it, when more than one did. */
  sources?: number;
  /** It is not in the booking plan: an extra scan after a breakdown. */
  unplanned?: boolean;
  /** Raw operator messages behind the entry. Operations only. */
  originals?: readonly OriginalMessage[];
  /** Starts with the original messages shown, for the entry a case points at. */
  originalsOpen?: boolean;
  /** One quiet control at the end of the caption: what the reader can do about the entry. Operations only. */
  action?: ReactNode;
  /** Flashes the row once each time this changes: how the user is sent to an entry. */
  flashKey?: string | number;
};

/** A hold that only a model has read so far: operations see it, and it is not yet a fact. */
export function isUnconfirmedHold(entry: TimelineEntryData) {
  return entry.mark === "hold" && entry.reading !== undefined && !entry.reading.confirmedBy;
}

// The rail either runs through a mark to its centre (`joined`) or stops 2px short of its
// 12px box (`apart`).
const LAYOUT = {
  ops: {
    row: "min-h-11",
    cell: "py-1",
    time: "text-xs/5 text-ink-700",
    label: "text-sm/5",
    caption: "min-h-4 text-xs/4",
    mark: "top-2",
    joined: { above: "top-0 h-3.5", below: "top-3.5 bottom-0" },
    apart: { above: "top-0 h-1.5", below: "top-[22px] bottom-0" },
  },
  // A customer came for a date: it is as dark as the label, with the time of day behind it.
  customer: {
    row: "min-h-14",
    cell: "py-1.5",
    time: "text-sm/6 text-ink-900 [&_span+span]:text-ink-600",
    label: "text-base/6",
    caption: "min-h-5 text-sm/5",
    mark: "top-3",
    joined: { above: "top-0 h-[18px]", below: "top-[18px] bottom-0" },
    apart: { above: "top-0 h-2.5", below: "top-[26px] bottom-0" },
  },
} as const;

// A filled mark is a node on the track, so the line runs through it. A hollow or unusual
// mark keeps clear of the line: nothing may cross a hollow centre.
function joinsRail(mark: TimelineMark, unconfirmed: boolean) {
  return mark === "confirmed" || mark === "planned" || (mark === "hold" && !unconfirmed);
}

function provenanceOf(mark: TimelineMark): ProvenanceKind | null {
  switch (mark) {
    case "confirmed":
    case "declared":
    case "estimated":
    case "planned":
    case "committed":
      return mark;
    case "unreported":
    case "hold":
    case "position":
    case "stale_position":
    case "note":
    case "action":
      return null;
    default:
      return assertNever(mark);
  }
}

type RailMarkProps = {
  mark: TimelineMark;
  unconfirmed: boolean;
  superseded: boolean;
};

function RailMark({ mark, unconfirmed, superseded }: RailMarkProps) {
  switch (mark) {
    case "confirmed":
    case "declared":
    case "estimated":
    case "planned":
    case "committed":
      return <ProvenanceMark kind={mark} words="none" muted={superseded} />;
    case "unreported":
      return <ProvenanceMark kind="planned" words="none" />;
    case "hold":
      // Unconfirmed, the hold is what a model says: hollow, and in the model's colour.
      return unconfirmed ? (
        <StatusGlyph status="held" unconfirmed color="inherit" className="text-ai-600" />
      ) : (
        <StatusGlyph status="held" />
      );
    case "position":
      return <PositionMarker />;
    case "stale_position":
      return <PositionMarker stale />;
    case "note":
      return (
        <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" className="text-ink-500">
          <path d="M2 3.5h8M2 6.5h8M2 9.5h5" stroke="currentColor" />
        </svg>
      );
    case "action":
      return (
        <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" className="text-ink-500">
          <path
            d="M3 9 8.5 3.5M4.5 3.5h4v4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return assertNever(mark);
  }
}

// What happened reads stronger than what is expected; a gap in the record reads weakest.
function labelTone(mark: TimelineMark, unconfirmed: boolean) {
  switch (mark) {
    case "declared":
    case "estimated":
    case "planned":
    case "committed":
      return "text-ink-700";
    case "unreported":
      return "text-ink-500";
    case "hold":
      return unconfirmed ? "text-ink-700" : "font-medium";
    case "confirmed":
    case "position":
    case "stale_position":
    case "note":
    case "action":
      return "font-medium";
    default:
      return assertNever(mark);
  }
}

const NO_BREAK_SPACE = String.fromCharCode(0xa0);

// In a mono column a one-digit day would shift the month: pad it to two cells.
function alignDay(day: string) {
  return day.replace(/(^|\s)(\d)(?=\s|$)/, `$1${NO_BREAK_SPACE}$2`);
}

type TimelineEntryProps = {
  entry: TimelineEntryData;
  audience: Audience;
  /** The rail from the previous row into this one, and from this one into the next. */
  above: Rail;
  below: Rail;
};

export function TimelineEntry({ entry, audience, above, below }: TimelineEntryProps) {
  const { id, mark, label, detail, when, was, reading, sources, originals, flashKey } = entry;
  const superseded = entry.superseded ?? false;
  const unconfirmed = isUnconfirmedHold(entry);
  const layout = LAYOUT[audience];
  const rail = joinsRail(mark, unconfirmed) ? layout.joined : layout.apart;
  // The hatched band is hollow, so it starts under the mark instead of running into it.
  const belowRail = below.stretch === "unknown" ? layout.apart.below : rail.below;
  const provenance = provenanceOf(mark);
  const caption = provenance ? provenanceCaption(provenance, audience, detail) : detail;
  const showOriginals = audience === "ops" && originals !== undefined && originals.length > 0;

  return (
    <Disclosure asChild defaultOpen={entry.originalsOpen}>
      <FlashItem
        id={id}
        flashKey={flashKey}
        className={clsx("rounded-sm", TIMELINE_GRID[audience], layout.row)}
      >
        <div className={clsx("font-mono tabular-nums", layout.cell, layout.time)}>
          {when && (
            <DateText
              {...when}
              day={alignDay(when.day)}
              superseded={superseded}
              className="flex justify-between"
            />
          )}
          {!when && mark === "unreported" && (
            <span className="font-sans text-ink-500">Not reported</span>
          )}
        </div>
        <div className="relative">
          <RailLine rail={above} className={rail.above} />
          <RailLine rail={below} className={belowRail} />
          <span className={clsx("absolute left-1.5 grid size-3 place-items-center", layout.mark)}>
            <RailMark mark={mark} unconfirmed={unconfirmed} superseded={superseded} />
          </span>
        </div>
        <div className={clsx("min-w-0", layout.cell)}>
          <div className={clsx("flex flex-wrap items-center gap-x-2", layout.label)}>
            <span className={superseded ? "text-ink-500" : labelTone(mark, unconfirmed)}>
              {label}
            </span>
            {sources !== undefined && sources > 1 && <Tag>{sources} sources</Tag>}
            {entry.unplanned && <Tag>Unplanned</Tag>}
            {reading && audience === "ops" && <AiMark state={{ kind: "reading", ...reading }} />}
          </div>
          <div className={clsx("flex items-center gap-x-3 text-ink-600", layout.caption)}>
            {(caption || was) && (
              <span className="min-w-0">
                {caption}
                {caption && was && " · "}
                {was && (
                  <>
                    was <DateText {...was} superseded />
                  </>
                )}
              </span>
            )}
            {showOriginals && (
              <DisclosureTrigger openLabel="Hide original" className="-my-1.5 shrink-0">
                Show original
              </DisclosureTrigger>
            )}
            {audience === "ops" && entry.action && (
              <span className="-my-1.5 shrink-0">{entry.action}</span>
            )}
          </div>
          {showOriginals && (
            <DisclosureContent>
              <OriginalMessages messages={originals} className="mt-2 mb-3" />
            </DisclosureContent>
          )}
        </div>
      </FlashItem>
    </Disclosure>
  );
}
