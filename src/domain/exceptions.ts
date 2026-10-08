import { assertNever } from "./assert-never";
import type { ShipmentDates } from "./dates";
import { documentStatuses } from "./documents";
import { estimateBasis } from "./estimate";
import { DOCUMENT_LABEL, HOLD_LABEL, MILESTONE_LABEL } from "./labels";
import type { ExceptionType, LoggedEvent } from "./log";
import { caseState, stepsFor, type CaseState, type OpenCase, type Step } from "./playbook";
import {
  IBON,
  originPlace,
  type Deadline,
  type OperatorId,
  type Shipment,
  type Source,
} from "./shipment";
import { nextExpectation, type Expectation } from "./staleness";
import {
  findMilestone,
  isDelivered,
  milestonesOf,
  openHolds,
  physicalProgress,
  type HoldEntry,
  type Timeline,
} from "./timeline";
import {
  addDays,
  diffDays,
  formatDay,
  formatStamp,
  HOUR,
  instantAt,
  localDate,
  type Instant,
  type Zone,
} from "./time";

export type Health = "held" | "delayed" | "at_risk" | "stale" | "on_time" | "delivered";
export type ExceptionHealth = Exclude<Health, "on_time" | "delivered">;

/** Worst first. */
export const HEALTH_RANK: Record<Health, number> = {
  held: 0,
  delayed: 1,
  at_risk: 2,
  stale: 3,
  on_time: 4,
  delivered: 5,
};

const TYPE_ORDER: ExceptionType[] = [
  "customs_hold",
  "carrier_hold",
  "delay",
  "predicted_delay",
  "cutoff_risk",
  "stale",
];

export const CUTOFF_WINDOW = 48 * HOUR;

export type EvidenceProvenance =
  | { kind: "confirmed"; source: Source }
  | { kind: "declared"; source: Source }
  | { kind: "ai_reading"; source: Source; confirmed: boolean }
  | { kind: "estimated" }
  | { kind: "rule" };

/** One line of "why it is here": the words, where they come from and the events behind them. */
export type EvidenceLine = { text: string; provenance: EvidenceProvenance; eventKeys: string[] };

export type ShipmentException = {
  /** `${shipmentId}:${type}`: stable for as long as the rule fires. */
  id: string;
  type: ExceptionType;
  health: ExceptionHealth;
  /** `declared`: an operator said so. `inferred`: Estela worked it out. `rule`: a deterministic check. */
  basis: "declared" | "inferred" | "rule";
  since: Instant;
  /** The clock: the deadline with a promise or money attached. */
  actBy?: { at: Instant; label: string };
  evidence: EvidenceLine[];
  /** It rests on a model reading that nobody has confirmed yet. */
  needsConfirmation?: true;
  steps: Step[];
  state: CaseState;
};

type Finding = OpenCase & {
  health: ExceptionHealth;
  evidence: EvidenceLine[];
  deadline?: Deadline;
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function firstOperator(reporters: readonly Source[]): OperatorId | undefined {
  return reporters.find((reporter) => reporter !== IBON);
}

/** The operator answerable for where the cargo is now: whoever reports its next physical milestone. */
function responsibleOperator(shipment: Shipment, timeline: Timeline): OperatorId | undefined {
  const { last, next } = physicalProgress(timeline);
  for (const entry of [next, last]) {
    const planned = shipment.plan.find((milestone) => milestone.key === entry?.key);
    const operatorId = planned ? firstOperator(planned.reporters) : undefined;
    if (operatorId) return operatorId;
  }
  return undefined;
}

function forwarderOf(shipment: Shipment): OperatorId | undefined {
  const release = shipment.plan.find((milestone) => milestone.code === "EXPORT_RELEASED");
  return release ? firstOperator(release.reporters) : undefined;
}

/** The deadline of a kind that is still ahead; failing that, the one most recently missed. */
function deadlineOf(
  shipment: Shipment,
  kind: Deadline["kind"],
  now: Instant,
): Deadline | undefined {
  const ofKind = shipment.deadlines
    .filter((deadline) => deadline.kind === kind)
    .sort((a, b) => a.at - b.at);
  return ofKind.find((deadline) => deadline.at >= now) ?? ofKind.at(-1);
}

function zoneOfDeadline(shipment: Shipment, deadline: Deadline, fallback: Zone): Zone {
  const protectedMilestone = shipment.plan.find((m) => m.key === deadline.milestoneKey);
  return protectedMilestone?.place.zone ?? fallback;
}

/** The last time an operator told us something that feeds the dates. */
function lastStatementAt(shipment: Shipment, timeline: Timeline): Instant {
  const received = milestonesOf(timeline).flatMap((entry) =>
    [entry.actual, entry.operatorEstimate].flatMap((stamp) =>
      stamp ? [stamp.provenance.receivedAt] : [],
    ),
  );
  return received.length > 0 ? Math.max(...received) : (shipment.plan[0]?.plannedAt ?? 0);
}

function holdFinding(shipment: Shipment, hold: HoldEntry): Finding {
  const source = hold.raised.provenance.source;
  const forwarderId = forwarderOf(shipment);
  return {
    type: hold.hold === "customs" ? "customs_hold" : "carrier_hold",
    health: "held",
    basis: "declared",
    since: hold.raised.at,
    hold,
    operatorId: source,
    ...(forwarderId ? { forwarderId } : {}),
    evidence: [
      {
        text: `${HOLD_LABEL[hold.hold].ops}: ${hold.reason}`,
        provenance:
          hold.reading === "table"
            ? { kind: "declared", source }
            : { kind: "ai_reading", source, confirmed: hold.reading === "ai_accepted" },
        eventKeys: [hold.eventKey],
      },
    ],
  };
}

function delayFinding(dates: ShipmentDates, now: Instant): Finding | null {
  const today = localDate(now, dates.zone);
  const overdueBy = diffDays(dates.committed, today);
  const declaredLateBy = dates.operator ? diffDays(dates.committed, dates.operator.day) : 0;
  if (overdueBy <= 0 && declaredLateBy <= 0) return null;

  const evidence: EvidenceLine[] = [];
  const since: Instant[] = [];
  if (dates.operator && declaredLateBy > 0) {
    since.push(dates.operator.provenance.receivedAt);
    evidence.push({
      text: `Delivery declared for ${formatDay(dates.operator.day)}, ${plural(declaredLateBy, "day")} after the committed ${formatDay(dates.committed)}`,
      provenance: { kind: "declared", source: dates.operator.provenance.source },
      eventKeys: [dates.operator.eventKey],
    });
  }
  if (overdueBy > 0) {
    since.push(instantAt(addDays(dates.committed, 1), "00:00", dates.zone));
    evidence.push({
      text: `The committed ${formatDay(dates.committed)} has passed without a delivery`,
      provenance: { kind: "rule" },
      eventKeys: [],
    });
  }
  return {
    type: "delay",
    health: "delayed",
    basis: "declared",
    since: Math.min(...since),
    evidence,
  };
}

function predictedDelayFinding(
  shipment: Shipment,
  timeline: Timeline,
  dates: ShipmentDates,
): Finding | null {
  const { estela, estelaDay, operator } = dates;
  if (!estela || estela.withheld || !estelaDay) return null;
  const lateBy = diffDays(dates.committed, estelaDay);
  if (lateBy <= 0) return null;

  const evidence: EvidenceLine[] = [
    {
      text: `Estela estimates delivery on ${formatDay(estelaDay)}, ${plural(lateBy, "day")} after the committed ${formatDay(dates.committed)}`,
      provenance: { kind: "estimated" },
      eventKeys: [],
    },
  ];
  const change = operator?.supersededBy;
  const changed = change
    ? milestonesOf(timeline).find((entry) => entry.key === change.milestoneKey)
    : undefined;
  if (change && changed?.actual && change.kind === "confirmed") {
    evidence.push({
      text: `"${MILESTONE_LABEL[changed.code]}" confirmed on ${formatStamp(changed.actual.at, changed.actual.precision, changed.place.zone)}`,
      provenance: { kind: "confirmed", source: change.source },
      eventKeys: changed.sources.map((source) => source.eventKey),
    });
  } else if (change && changed?.operatorEstimate) {
    const declared = changed.operatorEstimate;
    evidence.push({
      text: `Operator estimate for "${MILESTONE_LABEL[changed.code]}" is now ${formatStamp(declared.at, declared.precision, changed.place.zone)}`,
      provenance: { kind: "declared", source: change.source },
      eventKeys: [declared.eventKey],
    });
  }
  if (operator) {
    evidence.push({
      text: operator.superseded
        ? `The operator's door estimate, ${formatDay(operator.day)}, was declared before that change`
        : `The operator still declares delivery on ${formatDay(operator.day)}`,
      provenance: { kind: "declared", source: operator.provenance.source },
      eventKeys: [operator.eventKey],
    });
  }
  if (estela.assumption) {
    evidence.push({
      text: `Assumes: ${estela.assumption}`,
      provenance: { kind: "estimated" },
      eventKeys: [],
    });
  }

  const operatorId = responsibleOperator(shipment, timeline);
  return {
    type: "predicted_delay",
    health: "at_risk",
    basis: estimateBasis(estela),
    since: lastStatementAt(shipment, timeline),
    ...(operatorId ? { operatorId } : {}),
    evidence,
  };
}

function cutoffFinding(
  shipment: Shipment,
  timeline: Timeline,
  events: readonly LoggedEvent[],
  now: Instant,
): Finding | null {
  if (findMilestone(timeline, "EXPORT_RELEASED")?.actual) return null;
  const deadline = shipment.deadlines
    .filter((d) => d.kind === "export_cutoff" && d.at > now && d.at - now <= CUTOFF_WINDOW)
    .sort((a, b) => a.at - b.at)[0];
  if (!deadline) return null;

  // A document we have sent but that nobody acknowledged does not make the cut-off safe yet.
  const blocking = documentStatuses(shipment, timeline, events).filter(
    (document) => document.neededFor === "EXPORT_RELEASED" && document.status !== "on_file",
  );
  if (blocking.length === 0) return null;

  const zone = zoneOfDeadline(shipment, deadline, originPlace(shipment)?.zone ?? "Europe/Madrid");
  const forwarderId = forwarderOf(shipment);
  return {
    type: "cutoff_risk",
    health: "at_risk",
    basis: "rule",
    since: deadline.at - CUTOFF_WINDOW,
    deadline,
    notOnFile: blocking.map((document) => document.docType),
    ...(forwarderId ? { forwarderId } : {}),
    evidence: [
      ...blocking.map((document): EvidenceLine => ({
        text:
          document.status === "sent"
            ? `${DOCUMENT_LABEL[document.docType]} sent, not yet acknowledged`
            : `${DOCUMENT_LABEL[document.docType]} not on file`,
        provenance: { kind: "rule" },
        eventKeys: [],
      })),
      {
        text: `${deadline.label}: ${formatStamp(deadline.at, "minute", zone)}${deadline.consequence ? `. ${deadline.consequence}` : ""}`,
        provenance: { kind: "rule" },
        eventKeys: [],
      },
    ],
  };
}

function staleFinding(shipment: Shipment, timeline: Timeline, expectation: Expectation): Finding {
  const { reason } = expectation;
  const origin = originPlace(shipment)?.zone ?? "Europe/Madrid";
  const operatorId =
    reason.kind === "telematics_silence" ? reason.source : responsibleOperator(shipment, timeline);
  const text =
    reason.kind === "telematics_silence"
      ? `No signal since ${formatStamp(reason.lastSignalAt, "minute", origin)} from a truck that reports by telematics`
      : `${MILESTONE_LABEL[reason.milestone.code]} at ${reason.milestone.place.name} was expected ${formatStamp(reason.expected.at, reason.expected.precision, reason.milestone.place.zone)} and has not been reported`;
  return {
    type: "stale",
    health: "stale",
    basis: "rule",
    since: expectation.by,
    ...(operatorId ? { operatorId } : {}),
    evidence: [{ text, provenance: { kind: "rule" }, eventKeys: [] }],
  };
}

/**
 * A desk ranks by the deadline with a promise or money attached, not by type, so every exception
 * takes its clock from data.
 */
function clockOf(
  finding: Finding,
  steps: readonly Step[],
  shipment: Shipment,
  now: Instant,
): { at: Instant; label: string } | undefined {
  const untold = steps.some((s) => s.kind === "notify_customer" && s.state !== "done");
  const tellNow = untold ? { at: now, label: "Customer not yet told" } : undefined;
  const from = (deadline: Deadline | undefined) =>
    deadline ? { at: deadline.at, label: deadline.label } : undefined;

  switch (finding.type) {
    case "delay":
      return tellNow;
    case "predicted_delay":
      return finding.basis === "inferred"
        ? from(deadlineOf(shipment, "next_departure", now))
        : tellNow;
    case "carrier_hold":
      return from(deadlineOf(shipment, "next_departure", now));
    case "cutoff_risk":
      return from(finding.deadline);
    case "customs_hold":
      return from(deadlineOf(shipment, "free_time_end", now));
    case "stale":
      return undefined;
    default:
      return assertNever(finding.type);
  }
}

/**
 * The conditions that need a person, recomputed on every read: an exception exists exactly while
 * its rule fires, so there is no ticket to go stale. `events` may be the whole log.
 */
export function detectExceptions(
  shipment: Shipment,
  timeline: Timeline,
  dates: ShipmentDates,
  events: readonly LoggedEvent[],
  now: Instant,
): ShipmentException[] {
  if (isDelivered(timeline)) return [];
  const own = events.filter((event) => event.shipmentId === shipment.id);

  const holds = openHolds(timeline);
  const findings: Finding[] = holds.map((hold) => holdFinding(shipment, hold));

  const delay = delayFinding(dates, now);
  if (delay) findings.push(delay);

  // A prediction adds nothing next to a declared delay, and next to a hold its date is conditional.
  const predicted =
    delay || holds.length > 0 ? null : predictedDelayFinding(shipment, timeline, dates);
  if (predicted) findings.push(predicted);

  const cutoff = cutoffFinding(shipment, timeline, own, now);
  if (cutoff) findings.push(cutoff);

  const expectation = nextExpectation(timeline);
  if (expectation && now > expectation.by) {
    findings.push(staleFinding(shipment, timeline, expectation));
  }

  return findings
    .map((finding): ShipmentException => {
      const steps = stepsFor(finding, dates, own);
      const actBy = clockOf(finding, steps, shipment, now);
      return {
        id: `${shipment.id}:${finding.type}`,
        type: finding.type,
        health: finding.health,
        basis: finding.basis,
        since: finding.since,
        ...(actBy ? { actBy } : {}),
        evidence: finding.evidence,
        ...(finding.hold?.reading === "ai_pending" ? { needsConfirmation: true as const } : {}),
        steps,
        state: caseState(steps),
      };
    })
    .sort(
      (a, b) =>
        HEALTH_RANK[a.health] - HEALTH_RANK[b.health] ||
        TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type),
    );
}

/** The worst open exception decides; a delivered shipment is simply delivered. */
export function healthOf(timeline: Timeline, exceptions: readonly ShipmentException[]): Health {
  if (isDelivered(timeline)) return "delivered";
  return exceptions.reduce<Health>(
    (worst, exception) =>
      HEALTH_RANK[exception.health] < HEALTH_RANK[worst] ? exception.health : worst,
    "on_time",
  );
}
