import type { InternalEvent } from "./log";
import {
  isPhysical,
  type DocumentType,
  type HoldKind,
  type MilestoneCode,
  type Place,
  type Section,
  type ShipmentId,
  type Source,
  type UserId,
} from "./shipment";
import type { Instant, Precision } from "./time";

export type Confirmed = { kind: "confirmed"; source: Source; rawId: string; receivedAt: Instant };
export type Declared = { kind: "declared"; source: Source; rawId: string; receivedAt: Instant };
/** Taken from the booking plan: nobody has asserted it. */
export type Planned = { kind: "planned" };
export type Provenance = Confirmed | Declared | Planned;

export type Stamp<P extends Provenance> = { at: Instant; precision: Precision; provenance: P };

export type OperatorEstimate = Stamp<Declared> & { eventKey: string; remark?: string };
export type WithdrawnEstimate = OperatorEstimate & { withdrawnAt: Instant; reason?: string };

/** `table`: a mapping rule read it. `ai_*`: a model read free text, and a person has or has not confirmed it. */
export type ReadingState = "table" | "ai_pending" | "ai_accepted";

export type MilestoneSource = { source: Source; rawId: string; at: Instant; eventKey: string };

export type MilestoneEntry = {
  type: "milestone";
  key: string;
  code: MilestoneCode;
  place: Place;
  state: "done" | "next" | "upcoming" | "not_reported";
  unplanned?: true;
  /** The only slot a fact can occupy. */
  actual?: Stamp<Confirmed>;
  operatorEstimate?: OperatorEstimate;
  /** The operator's last estimate, when the operator has taken it back. */
  withdrawnEstimate?: WithdrawnEstimate;
  planned?: Stamp<Planned>;
  /** Everyone who confirmed it, in authority order. */
  sources: MilestoneSource[];
  reading?: ReadingState;
  /** A model read this milestone from free text and nobody has confirmed it: not a fact yet. */
  pendingReading?: MilestoneSource & { precision: Precision };
};

export type HoldEntry = {
  type: "hold";
  hold: HoldKind;
  open: boolean;
  reason: string;
  /**
   * The document the hold is said to be waiting for. Absent means none was named: what would
   * release the goods is then not known, and no rule may assume it.
   */
  requires?: DocumentType;
  raised: Stamp<Declared>;
  clearedAt?: Instant;
  reading: ReadingState;
  eventKey: string;
};

export type PositionEntry = {
  type: "position";
  lastPlace: string;
  at: Instant;
  count: number;
  source: Source;
  rawId: string;
};

export type NoteEntry = {
  type: "note";
  text: string;
  at: Instant;
  source: Source;
  rawId: string;
  eventKey: string;
  /**
   * Why something that an operator reported as more than a remark is shown as one: the source may
   * not assert that milestone, the plan has no such milestone, or it is a model reading that is
   * still unconfirmed or was rejected.
   */
  status?: "unauthorised" | "unmatched" | "ai_pending" | "ai_rejected";
};

export type ActionEntry = {
  type: "action";
  id: string;
  action: InternalEvent["type"];
  label: string;
  by: UserId;
  at: Instant;
};

export type TimelineEntry = MilestoneEntry | HoldEntry | PositionEntry | NoteEntry | ActionEntry;

export type TimelineSection = { section: Section; entries: TimelineEntry[] };

export type Signal = { source: Source; lastOccurredAt: Instant; lastReceivedAt: Instant };

export type Timeline = {
  shipmentId: ShipmentId;
  /** Above the first section: the booking, and whatever happened before the cargo moved. */
  lead: TimelineEntry[];
  sections: TimelineSection[];
  /** The last time each source was heard from, about anything. */
  signals: Signal[];
  /**
   * The latest fact to reach us and who sent it, kept together so that a time is never shown
   * next to another sender's name. Unconfirmed and rejected model readings do not count.
   */
  lastFact: { receivedAt: Instant; source: Source } | null;
};

export function allEntries(timeline: Timeline): TimelineEntry[] {
  return [...timeline.lead, ...timeline.sections.flatMap((section) => section.entries)];
}

/** Every milestone in timeline order, unplanned ones included where they were inserted. */
export function milestonesOf(timeline: Timeline): MilestoneEntry[] {
  return allEntries(timeline).filter(
    (entry): entry is MilestoneEntry => entry.type === "milestone",
  );
}

export function holdsOf(timeline: Timeline): HoldEntry[] {
  return allEntries(timeline).filter((entry): entry is HoldEntry => entry.type === "hold");
}

export function openHolds(timeline: Timeline): HoldEntry[] {
  return holdsOf(timeline).filter((hold) => hold.open);
}

/** The planned milestone with that code; the first one when the plan has several (hub scans). */
export function findMilestone(timeline: Timeline, code: MilestoneCode): MilestoneEntry | undefined {
  return milestonesOf(timeline).find((entry) => entry.code === code && !entry.unplanned);
}

export function deliveryOf(timeline: Timeline): MilestoneEntry | undefined {
  return findMilestone(timeline, "DELIVERED");
}

export function isDelivered(timeline: Timeline): boolean {
  return deliveryOf(timeline)?.actual !== undefined;
}

/** The furthest confirmed milestone that says where the cargo is, and the next one expected after it. */
export function physicalProgress(timeline: Timeline): {
  last: MilestoneEntry | undefined;
  next: MilestoneEntry | undefined;
} {
  const physical = milestonesOf(timeline).filter((entry) => isPhysical(entry.code));
  const lastIndex = physical.findLastIndex((entry) => entry.actual !== undefined);
  return {
    last: physical[lastIndex],
    next: physical.slice(lastIndex + 1).find((entry) => entry.actual === undefined),
  };
}
