import { assertNever } from "./assert-never";
import { compareText } from "./compare";
import { HOLD_LABEL, MILESTONE_LABEL } from "./labels";
import {
  internalEvents,
  operatorEvents,
  type Fact,
  type InternalEvent,
  type LoggedEvent,
  type OperatorEvent,
} from "./log";
import {
  isPhysical,
  milestoneKey,
  type HoldKind,
  type PlannedMilestone,
  type Shipment,
  type Source,
} from "./shipment";
import { formatStamp, type Instant, type Precision } from "./time";
import type {
  Confirmed,
  Declared,
  HoldEntry,
  MilestoneEntry,
  MilestoneSource,
  NoteEntry,
  OperatorEstimate,
  ReadingState,
  Signal,
  Stamp,
  Timeline,
  TimelineEntry,
} from "./timeline";

type ReadingStatus = ReadingState | "ai_rejected";

/** Every operator event of a shipment, sorted once into what it can affect. */
type Sorted = {
  confirmations: Map<string, Map<Source, OperatorEvent>>;
  pendingMilestones: Map<string, OperatorEvent>;
  unplanned: Map<string, Map<Source, OperatorEvent>>;
  statements: Map<string, OperatorEvent[]>;
  holds: { event: OperatorEvent; status: ReadingState }[];
  positions: OperatorEvent[];
  notes: { event: OperatorEvent; status?: NoteEntry["status"] }[];
  signals: Map<Source, Signal>;
  lastFactReceivedAt: Instant | null;
};

/** Something that is not in the plan, with the instant that says where in the timeline it goes. */
type Extra = { at: Instant; rank: number; tiebreak: string; entry: TimelineEntry };

function byOccurrence(a: OperatorEvent, b: OperatorEvent): number {
  return a.occurredAt - b.occurredAt || a.receivedAt - b.receivedAt || compareText(a.key, b.key);
}

function byReceipt(a: OperatorEvent, b: OperatorEvent): number {
  return a.receivedAt - b.receivedAt || a.occurredAt - b.occurredAt || compareText(a.key, b.key);
}

/** A redelivered message yields the same key again: the first receipt is the one kept. */
function withoutRedeliveries(events: OperatorEvent[]): OperatorEvent[] {
  const byKey = new Map<string, OperatorEvent>();
  for (const event of events) {
    const kept = byKey.get(event.key);
    const earlier =
      !kept ||
      event.receivedAt < kept.receivedAt ||
      (event.receivedAt === kept.receivedAt && compareText(event.rawId, kept.rawId) < 0);
    if (earlier) byKey.set(event.key, event);
  }
  return [...byKey.values()].sort(byOccurrence);
}

/** What a person decided about each model reading; when reviewed twice, the later review. */
function reviewsOf(events: readonly LoggedEvent[]): Map<string, boolean> {
  const latest = new Map<string, { at: Instant; id: string; accepted: boolean }>();
  for (const event of internalEvents(events)) {
    if (event.type !== "reading_reviewed") continue;
    const kept = latest.get(event.eventKey);
    const later =
      !kept || event.at > kept.at || (event.at === kept.at && compareText(event.id, kept.id) > 0);
    if (later) latest.set(event.eventKey, event);
  }
  return new Map([...latest].map(([key, review]) => [key, review.accepted]));
}

function describe(fact: Fact): string {
  switch (fact.type) {
    case "milestone":
      return `${MILESTONE_LABEL[fact.code]} reported at ${fact.place.name}`;
    case "estimate":
      return `${MILESTONE_LABEL[fact.code]} estimated for ${formatStamp(fact.at, fact.precision, fact.place.zone)}`;
    case "estimate_withdrawn":
      return `Estimate withdrawn: ${MILESTONE_LABEL[fact.code].toLowerCase()}`;
    case "hold":
      return fact.state === "raised"
        ? `${HOLD_LABEL[fact.hold].ops}: ${fact.reason}`
        : `${HOLD_LABEL[fact.hold].ops} cleared`;
    case "position":
      return `Position: ${fact.place}`;
    case "note":
      return fact.text;
    default:
      return assertNever(fact);
  }
}

function actionLabel(event: InternalEvent): string {
  switch (event.type) {
    case "reading_reviewed":
      return event.accepted ? "AI reading confirmed" : "AI reading rejected";
    case "notice_sent":
      return `Customer notice sent: ${event.subject}`;
    case "operator_contacted":
      return `Message sent to the operator: ${event.subject}`;
    case "document_sent":
      return `Document sent: ${event.fileName}`;
    default:
      return assertNever(event);
  }
}

function toSource(event: OperatorEvent): MilestoneSource {
  return { source: event.source, rawId: event.rawId, at: event.occurredAt, eventKey: event.key };
}

function confirmedStamp(event: OperatorEvent): Stamp<Confirmed> {
  return {
    at: event.occurredAt,
    precision: event.precision,
    provenance: {
      kind: "confirmed",
      source: event.source,
      rawId: event.rawId,
      receivedAt: event.receivedAt,
    },
  };
}

function declaredStamp(event: OperatorEvent, at: Instant, precision: Precision): Stamp<Declared> {
  return {
    at,
    precision,
    provenance: {
      kind: "declared",
      source: event.source,
      rawId: event.rawId,
      receivedAt: event.receivedAt,
    },
  };
}

function operatorEstimateOf(event: OperatorEvent): OperatorEstimate | undefined {
  if (event.fact.type !== "estimate") return undefined;
  return {
    ...declaredStamp(event, event.fact.at, event.fact.precision),
    eventKey: event.key,
    ...(event.fact.remark ? { remark: event.fact.remark } : {}),
  };
}

/** The same milestone again from the same source is a correction: the latest receipt wins. */
function keepLatest(
  target: Map<string, Map<Source, OperatorEvent>>,
  key: string,
  event: OperatorEvent,
): void {
  const bySource = target.get(key) ?? new Map<Source, OperatorEvent>();
  const kept = bySource.get(event.source);
  if (!kept || byReceipt(kept, event) < 0) bySource.set(event.source, event);
  target.set(key, bySource);
}

/**
 * Step one. Reads each event once and decides what it may affect: authority (only a listed
 * reporter may speak about a planned milestone) and the gate on model readings are applied here,
 * so nothing downstream can use an event it should not.
 */
function sortEvents(
  shipment: Shipment,
  reported: readonly OperatorEvent[],
  reviews: ReadonlyMap<string, boolean>,
): Sorted {
  const plan = new Map<string, PlannedMilestone>(shipment.plan.map((m) => [m.key, m]));
  const sorted: Sorted = {
    confirmations: new Map(),
    pendingMilestones: new Map(),
    unplanned: new Map(),
    statements: new Map(),
    holds: [],
    positions: [],
    notes: [],
    signals: new Map(),
    lastFactReceivedAt: null,
  };

  const statusOf = (event: OperatorEvent): ReadingStatus => {
    if (event.reading.method === "table") return "table";
    const accepted = reviews.get(event.key);
    if (accepted === undefined) return "ai_pending";
    return accepted ? "ai_accepted" : "ai_rejected";
  };

  for (const event of reported) {
    const heard = sorted.signals.get(event.source);
    sorted.signals.set(event.source, {
      source: event.source,
      lastOccurredAt: Math.max(heard?.lastOccurredAt ?? event.occurredAt, event.occurredAt),
      lastReceivedAt: Math.max(heard?.lastReceivedAt ?? event.receivedAt, event.receivedAt),
    });

    const status = statusOf(event);
    if (status === "ai_rejected") {
      sorted.notes.push({ event, status });
      continue;
    }
    if (status !== "ai_pending") {
      sorted.lastFactReceivedAt = Math.max(
        sorted.lastFactReceivedAt ?? event.receivedAt,
        event.receivedAt,
      );
    }

    const { fact } = event;
    switch (fact.type) {
      case "milestone": {
        const key = milestoneKey(fact.code, fact.place);
        const planned = plan.get(key);
        if (planned && !planned.reporters.includes(event.source)) {
          sorted.notes.push({ event, status: "unauthorised" });
        } else if (status === "ai_pending") {
          if (planned) sorted.pendingMilestones.set(key, event);
          else sorted.notes.push({ event, status });
        } else {
          keepLatest(planned ? sorted.confirmations : sorted.unplanned, key, event);
        }
        break;
      }
      case "estimate":
      case "estimate_withdrawn": {
        const key = milestoneKey(fact.code, fact.place);
        const planned = plan.get(key);
        if (!planned) sorted.notes.push({ event, status: "unmatched" });
        else if (!planned.reporters.includes(event.source)) {
          sorted.notes.push({ event, status: "unauthorised" });
        } else if (status === "ai_pending") sorted.notes.push({ event, status });
        else sorted.statements.set(key, [...(sorted.statements.get(key) ?? []), event]);
        break;
      }
      case "hold":
        // A pending reading may raise a hold for operations to look at; only a fact may clear one.
        if (status === "ai_pending" && fact.state === "cleared") {
          sorted.notes.push({ event, status });
        } else sorted.holds.push({ event, status });
        break;
      case "position":
        if (status === "ai_pending") sorted.notes.push({ event, status });
        else sorted.positions.push(event);
        break;
      case "note":
        sorted.notes.push(status === "ai_pending" ? { event, status } : { event });
        break;
      default:
        assertNever(fact);
    }
  }
  return sorted;
}

/**
 * Step two. One entry per planned milestone, in plan order. `actual` is filled only by a
 * confirmation; a milestone that sits before the furthest confirmed one and was never reported
 * stays `not_reported` and never gets a time.
 */
function plannedEntries(shipment: Shipment, sorted: Sorted): MilestoneEntry[] {
  const entries = shipment.plan.map((milestone): MilestoneEntry => {
    const bySource = sorted.confirmations.get(milestone.key);
    const confirmed = milestone.reporters.flatMap((reporter) => bySource?.get(reporter) ?? []);
    const entry: MilestoneEntry = {
      type: "milestone",
      key: milestone.key,
      code: milestone.code,
      place: milestone.place,
      state: "upcoming",
      planned: {
        at: milestone.plannedAt,
        precision: milestone.precision,
        provenance: { kind: "planned" },
      },
      sources: confirmed.map(toSource),
    };

    // Two sources may confirm one physical event: the first reporter in authority order gives the time.
    const authority = confirmed[0];
    if (authority) {
      entry.actual = confirmedStamp(authority);
      entry.reading = authority.reading.method === "ai" ? "ai_accepted" : "table";
      return entry;
    }

    const pending = sorted.pendingMilestones.get(milestone.key);
    if (pending) {
      entry.reading = "ai_pending";
      entry.pendingReading = { ...toSource(pending), precision: pending.precision };
    }

    // What the operators last said about when it will happen: an estimate, or its withdrawal.
    const said = [...(sorted.statements.get(milestone.key) ?? [])].sort(byReceipt);
    const last = said.at(-1);
    const estimate = last ? operatorEstimateOf(last) : undefined;
    if (estimate) entry.operatorEstimate = estimate;
    if (last?.fact.type === "estimate_withdrawn") {
      const before = said.findLast((event) => event.fact.type === "estimate");
      const withdrawn = before ? operatorEstimateOf(before) : undefined;
      if (withdrawn) {
        entry.withdrawnEstimate = {
          ...withdrawn,
          withdrawnAt: last.receivedAt,
          ...(last.fact.remark ? { reason: last.fact.remark } : {}),
        };
      }
    }
    return entry;
  });

  const furthestDone = entries.findLastIndex((entry) => entry.actual !== undefined);
  entries.forEach((entry, index) => {
    if (entry.actual) entry.state = "done";
    else if (index < furthestDone) entry.state = "not_reported";
    else if (index === furthestDone + 1) entry.state = "next";
  });
  return entries;
}

/** A hold is open from the event that raises it to the next one that clears it. */
function holdEntries(events: Sorted["holds"]): HoldEntry[] {
  const entries: HoldEntry[] = [];
  const open = new Map<HoldKind, HoldEntry>();
  for (const { event, status } of events) {
    if (event.fact.type !== "hold") continue;
    const standing = open.get(event.fact.hold);
    if (event.fact.state === "raised") {
      if (standing) continue;
      const entry: HoldEntry = {
        type: "hold",
        hold: event.fact.hold,
        open: true,
        reason: event.fact.reason,
        raised: declaredStamp(event, event.occurredAt, event.precision),
        reading: status,
        eventKey: event.key,
      };
      open.set(event.fact.hold, entry);
      entries.push(entry);
    } else if (standing) {
      standing.open = false;
      standing.clearedAt = event.occurredAt;
      open.delete(event.fact.hold);
    }
  }
  return entries;
}

/** Step three. Everything outside the plan, except positions, which are grouped once placed. */
function extrasOf(sorted: Sorted, actions: readonly InternalEvent[]): Extra[] {
  const extras: Extra[] = [];

  for (const [key, bySource] of sorted.unplanned) {
    const confirmed = [...bySource.values()].sort(byReceipt);
    const first = confirmed[0];
    if (!first || first.fact.type !== "milestone") continue;
    extras.push({
      at: first.occurredAt,
      rank: 0,
      tiebreak: key,
      entry: {
        type: "milestone",
        key,
        code: first.fact.code,
        place: first.fact.place,
        state: "done",
        unplanned: true,
        actual: confirmedStamp(first),
        sources: confirmed.map(toSource),
        reading: first.reading.method === "ai" ? "ai_accepted" : "table",
      },
    });
  }

  for (const entry of holdEntries(sorted.holds)) {
    extras.push({ at: entry.raised.at, rank: 1, tiebreak: entry.eventKey, entry });
  }

  for (const { event, status } of sorted.notes) {
    extras.push({
      at: event.occurredAt,
      rank: 3,
      tiebreak: event.key,
      entry: {
        type: "note",
        text: describe(event.fact),
        at: event.occurredAt,
        source: event.source,
        rawId: event.rawId,
        eventKey: event.key,
        ...(status ? { status } : {}),
      },
    });
  }

  for (const event of actions) {
    extras.push({
      at: event.at,
      rank: 4,
      tiebreak: event.id,
      entry: {
        type: "action",
        id: event.id,
        action: event.type,
        label: actionLabel(event),
        by: event.by,
        at: event.at,
      },
    });
  }
  return extras;
}

const LEAD = "";

/**
 * Step four. The plan is the skeleton: planned milestones keep plan order, because operators'
 * clocks and precisions differ and a day-precision customs event must not jump the queue.
 * Everything else is inserted by time: into the section the cargo was in at that instant, after
 * the last milestone of that section confirmed by then.
 */
function layOut(
  shipment: Shipment,
  planned: readonly MilestoneEntry[],
  extras: readonly Extra[],
  positions: readonly OperatorEvent[],
): Pick<Timeline, "lead" | "sections"> {
  type Slot = { planned: MilestoneEntry[]; extras: (Extra & { after: number })[] };
  const slots = new Map<string, Slot>([[LEAD, { planned: [], extras: [] }]]);
  for (const section of shipment.sections) slots.set(section.id, { planned: [], extras: [] });

  shipment.plan.forEach((milestone, index) => {
    const entry = planned[index];
    const slot = slots.get(milestone.sectionId ?? LEAD) ?? slots.get(LEAD);
    if (entry && slot) slot.planned.push(entry);
  });

  /** The section of the furthest physical milestone confirmed by that instant; before any, the lead. */
  const sectionAt = (at: Instant): string => {
    let sectionId = LEAD;
    shipment.plan.forEach((milestone, index) => {
      const actual = planned[index]?.actual;
      if (!actual || actual.at > at || milestone.sectionId === null) return;
      if (isPhysical(milestone.code) && slots.has(milestone.sectionId)) {
        sectionId = milestone.sectionId;
      }
    });
    return sectionId;
  };

  const place = (extra: Extra): void => {
    const slot = slots.get(sectionAt(extra.at));
    if (!slot) return;
    const after = slot.planned.findLastIndex(
      (entry) => entry.actual !== undefined && entry.actual.at <= extra.at,
    );
    slot.extras.push({ ...extra, after });
  };

  extras.forEach(place);

  // A truck that reports every 30 minutes would bury the timeline: one entry per section, with
  // the last place and how many positions stand behind it.
  const positionsBySection = new Map<string, OperatorEvent[]>();
  for (const event of positions) {
    const sectionId = sectionAt(event.occurredAt);
    positionsBySection.set(sectionId, [...(positionsBySection.get(sectionId) ?? []), event]);
  }
  for (const group of positionsBySection.values()) {
    const latest = group.at(-1);
    if (!latest || latest.fact.type !== "position") continue;
    place({
      at: latest.occurredAt,
      rank: 2,
      tiebreak: latest.key,
      entry: {
        type: "position",
        lastPlace: latest.fact.place,
        at: latest.occurredAt,
        count: group.length,
        source: latest.source,
        rawId: latest.rawId,
      },
    });
  }

  const entriesOf = (slot: Slot | undefined): TimelineEntry[] => {
    if (!slot) return [];
    const inOrder = [...slot.extras].sort(
      (a, b) =>
        a.after - b.after || a.at - b.at || a.rank - b.rank || compareText(a.tiebreak, b.tiebreak),
    );
    const following = (index: number) =>
      inOrder.filter((extra) => extra.after === index).map((extra) => extra.entry);
    return [
      ...following(-1),
      ...slot.planned.flatMap((entry, index) => [entry, ...following(index)]),
    ];
  };

  return {
    lead: entriesOf(slots.get(LEAD)),
    sections: shipment.sections.map((section) => ({
      section,
      entries: entriesOf(slots.get(section.id)),
    })),
  };
}

/**
 * Folds the log into one timeline. It is a function of the *set* of events: arrival order and
 * redelivered duplicates do not change the result, which is why it never looks at a clock.
 * `events` may be the whole log; other shipments are ignored.
 */
export function buildTimeline(shipment: Shipment, events: readonly LoggedEvent[]): Timeline {
  const own = events.filter((event) => event.shipmentId === shipment.id);
  const sorted = sortEvents(shipment, withoutRedeliveries(operatorEvents(own)), reviewsOf(own));
  const planned = plannedEntries(shipment, sorted);
  const extras = extrasOf(sorted, internalEvents(own));

  return {
    shipmentId: shipment.id,
    ...layOut(shipment, planned, extras, sorted.positions),
    signals: [...sorted.signals.values()].sort((a, b) => compareText(a.source, b.source)),
    lastFactReceivedAt: sorted.lastFactReceivedAt,
  };
}
