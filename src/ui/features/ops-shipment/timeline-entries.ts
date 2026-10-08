import type {
  DatesView,
  TimelineEntryView,
  TimelineSourceView,
  WhenView,
} from "@/application/views";
import type { Instant } from "@/domain/time";
import { age, dateValue } from "@/ui/format/when";
import type { AiReading } from "@/ui/kit/ai-words";
import { assertNever } from "@/ui/kit/assert-never";
import type { TimelineEntryData } from "@/ui/kit/timeline-entry";
import { DESK_PLACE } from "./desk";
import { originalMessages } from "./original-message";
import { readingState } from "./reading-state";

type Milestone = Extract<TimelineEntryView, { type: "milestone" }>;
type Reading = NonNullable<Milestone["reading"]>;

export type TimelineContext = {
  now: Instant;
  /** The door dates: they say whether the operator's delivery estimate still stands. */
  dates: DatesView;
};

/** The DOM id of an entry's row. Entry ids carry place names, and an id may hold no space. */
export function entryAnchor(entryId: string): string {
  return entryId.replace(/\s+/g, "-");
}

function joined(parts: readonly (string | null | false | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

function sameMoment(one: WhenView, other: WhenView): boolean {
  return one.at === other.at && one.precision === other.precision;
}

// The age is that of the message, when there is one: how long the desk has known.
function received(source: TimelineSourceView, now: Instant): string {
  return age(source.original?.receivedAt ?? source.when.at, now);
}

function reported(source: TimelineSourceView, now: Instant): string {
  return `${source.name} · ${received(source, now)}`;
}

function aiReading(reading: Reading | null): AiReading | undefined {
  if (!reading || reading.state === "table") {
    return undefined;
  }
  return readingState(reading.state === "ai_accepted", reading.reviewedBy);
}

/**
 * A milestone is one row while a single date speaks for it: the fact, or else the operator's
 * estimate, or else Estela's step where its chain moved away from the plan, or else the plan.
 * It is two rows where an estimate that no longer stands has to stay visible next to the one
 * that replaced it: a superseded or contested door estimate, or one the operator withdrew.
 */
function milestoneRows(entry: Milestone, { now, dates }: TimelineContext): TimelineEntryData[] {
  const id = entryAnchor(entry.id);
  const label = `${entry.label}, ${entry.place.name}`;
  const { actual, operatorEstimate, withdrawn, planned, estela } = entry;

  if (actual) {
    const [authority] = entry.sources;
    return [
      {
        id,
        mark: "confirmed",
        label,
        when: dateValue(actual),
        detail: authority && reported(authority, now),
        sources: entry.sources.length,
        unplanned: entry.unplanned,
        reading: aiReading(entry.reading),
        originals: originalMessages(entry.sources.map((source) => source.original)),
      },
    ];
  }
  if (entry.state === "not_reported") {
    return [{ id, mark: "unreported", label }];
  }

  const estimated = (when: WhenView, rowId: string, was?: WhenView | null): TimelineEntryData => ({
    id: rowId,
    mark: "estimated",
    label,
    when: dateValue(when),
    was: was ? dateValue(was) : undefined,
  });
  const secondId = `${id}:estela`;

  if (operatorEstimate) {
    const door = entry.code === "DELIVERED" ? dates : null;
    const superseded = door?.operator?.superseded ?? false;
    const contested = door?.estela?.kind === "estimate" && !door.estela.agreesWithOperator;
    const moved = !superseded && planned && !sameMoment(operatorEstimate.when, planned);
    const declared: TimelineEntryData = {
      id,
      mark: "declared",
      label,
      when: dateValue(operatorEstimate.when),
      superseded,
      detail: joined([
        operatorEstimate.by,
        (superseded && door?.operator?.supersededNote) ||
          `declared ${age(operatorEstimate.declaredAt, now)}`,
        operatorEstimate.remark && `“${operatorEstimate.remark}”`,
      ]),
      was: moved ? dateValue(planned) : undefined,
      originals: originalMessages([operatorEstimate.original]),
    };
    return estela && contested ? [declared, estimated(estela, secondId)] : [declared];
  }

  if (withdrawn) {
    const taken: TimelineEntryData = {
      id,
      mark: "declared",
      label,
      when: dateValue(withdrawn.when),
      superseded: true,
      detail: `${withdrawn.by} · withdrawn ${age(withdrawn.at, now)}`,
    };
    return estela ? [taken, estimated(estela, secondId)] : [taken];
  }

  if (estela && !(planned && sameMoment(estela, planned))) {
    return [estimated(estela, id, planned)];
  }
  return [{ id, mark: "planned", label, when: planned ? dateValue(planned) : undefined }];
}

function entryRows(entry: TimelineEntryView, context: TimelineContext): TimelineEntryData[] {
  const { now } = context;
  const id = entryAnchor(entry.id);

  switch (entry.type) {
    case "milestone":
      return milestoneRows(entry, context);
    case "hold":
      return [
        {
          id,
          mark: "hold",
          label: `${entry.label}: ${entry.reason}`,
          when: dateValue(entry.raised),
          detail: joined([
            entry.source.name,
            entry.source.original?.channelLabel,
            received(entry.source, now),
            entry.clearedAt !== null && `cleared ${age(entry.clearedAt, now)}`,
          ]),
          reading: aiReading(entry.reading),
          originals: originalMessages([entry.source.original]),
        },
      ];
    case "position":
      return [
        {
          id,
          mark: entry.stale ? "stale_position" : "position",
          label: `Last position: ${entry.lastPlace}`,
          when: dateValue(entry.source.when),
          // A position is as old as its own timestamp: that is what staleness counts from.
          detail: joined([
            `${entry.count} ${entry.count === 1 ? "position" : "positions"}`,
            entry.source.name,
            age(entry.source.when.at, now),
          ]),
          originals: originalMessages([entry.source.original]),
        },
      ];
    case "note":
      return [
        {
          id,
          mark: "note",
          label: entry.text,
          when: dateValue(entry.source.when),
          // A pending reading says so with the model's own tag instead.
          detail: joined([
            entry.status !== "ai_pending" && entry.statusLabel,
            reported(entry.source, now),
          ]),
          reading: entry.status === "ai_pending" ? {} : undefined,
          originals: originalMessages([entry.source.original]),
        },
      ];
    case "action":
      return [
        {
          id,
          mark: "action",
          label: entry.label,
          when: dateValue(entry.when),
          detail: joined([entry.by, `${DESK_PLACE} time`, age(entry.when.at, now)]),
        },
      ];
    default:
      return assertNever(entry);
  }
}

/** The entries of a section as the kit's timeline takes them, in the same order. */
export function timelineRows(
  entries: readonly TimelineEntryView[],
  context: TimelineContext,
): TimelineEntryData[] {
  return entries.flatMap((entry) => entryRows(entry, context));
}
