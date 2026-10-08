import type { MilestoneCode, Source } from "./shipment";
import {
  isDelivered,
  physicalProgress,
  type Declared,
  type MilestoneEntry,
  type Planned,
  type Stamp,
  type Timeline,
} from "./timeline";
import { addDays, HOUR, instantAt, localDate, type Instant } from "./time";

/**
 * Hours of silence mean nothing by themselves: a shipping line says nothing between departure and
 * arrival. Staleness is "an update we had reason to expect is overdue", and each reason is data.
 */

/** Covers the driver's 11 h daily rest plus margin. */
export const TELEMATICS_SILENCE = 14 * HOUR;

type Grace = { kind: "hours"; hours: number } | { kind: "next_day_by"; time: string };

/** How long after its expected time a milestone may go unreported. Milestones not listed have no rule. */
export const REPORTING_GRACE: Partial<Record<MilestoneCode, Grace>> = {
  PICKED_UP: { kind: "hours", hours: 4 },
  VESSEL_ARRIVED: { kind: "hours", hours: 24 },
  DELIVERED: { kind: "next_day_by", time: "10:00" },
};

export type Expectation = {
  /** After this instant the shipment is stale. */
  by: Instant;
  reason:
    | { kind: "telematics_silence"; source: Source; lastSignalAt: Instant }
    | {
        kind: "overdue_milestone";
        milestone: MilestoneEntry;
        expected: Stamp<Declared> | Stamp<Planned>;
      };
};

function telematicsExpectation(timeline: Timeline): Expectation | null {
  const { last } = physicalProgress(timeline);
  if (!last || last.code === "DELIVERED") return null;
  const current = timeline.sections.find(({ entries }) => entries.includes(last));
  if (!current || current.section.kind !== "road" || !current.section.telematics) return null;

  const operatorId = current.section.operatorId;
  const signal = timeline.signals.find((heard) => heard.source === operatorId);
  if (!signal) return null;
  return {
    by: signal.lastOccurredAt + TELEMATICS_SILENCE,
    reason: {
      kind: "telematics_silence",
      source: operatorId,
      lastSignalAt: signal.lastOccurredAt,
    },
  };
}

function milestoneExpectation(timeline: Timeline): Expectation | null {
  const { next } = physicalProgress(timeline);
  if (!next) return null;
  const grace = REPORTING_GRACE[next.code];
  const expected = next.operatorEstimate ?? next.planned;
  if (!grace || !expected) return null;

  const by =
    grace.kind === "hours"
      ? expected.at + grace.hours * HOUR
      : instantAt(addDays(localDate(expected.at, next.place.zone), 1), grace.time, next.place.zone);
  return { by, reason: { kind: "overdue_milestone", milestone: next, expected } };
}

/** The earliest update the shipment owes us, or `null` when nothing is expected. */
export function nextExpectation(timeline: Timeline): Expectation | null {
  if (isDelivered(timeline)) return null;
  const expectations = [telematicsExpectation(timeline), milestoneExpectation(timeline)];
  return (
    expectations
      .filter((expectation): expectation is Expectation => expectation !== null)
      .sort((a, b) => a.by - b.by)[0] ?? null
  );
}

/** The instant after which the shipment is stale, or `null`. Unknown is not late: it is its own state. */
export function expectedUpdateBy(timeline: Timeline): Instant | null {
  return nextExpectation(timeline)?.by ?? null;
}
