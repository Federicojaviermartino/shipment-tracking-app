import type { EstimatorInput, EtaEstimator } from "@/application/ports/eta-estimator";
import { reportNoun } from "@/application/text/format";
import { assertNever } from "@/domain/assert-never";
import type { EstelaEstimate, Estimate, EstimateStep, EstimateStepSource } from "@/domain/estimate";
import { destinationZone, type MilestoneCode, type Place, type Shipment } from "@/domain/shipment";
import { nextExpectation, type Expectation } from "@/domain/staleness";
import {
  dayInstant,
  formatStamp,
  HOUR,
  instantAt,
  isPast,
  isWorkingDay,
  localDate,
  localTime,
  nextWorkingDay,
  type Instant,
  type Precision,
  type Zone,
} from "@/domain/time";
import { findMilestone, milestonesOf, openHolds, type MilestoneEntry } from "@/domain/timeline";

/** How operations read the provenance of an estimate: there is no learned model behind it yet. */
export const ESTIMATE_BASIS = "Rule-based estimate";

/** A linehaul or a round that is this late has left without the cargo. */
const MISSED_DEPARTURE = 6 * HOUR;

/** These follow the vessel, not our box: nothing we do upstream moves them. */
const SCHEDULE_ANCHORS: ReadonlySet<MilestoneCode> = new Set([
  "LOADED",
  "VESSEL_DEPARTED",
  "VESSEL_ARRIVED",
]);

/** Offices and trucks do not work weekends: delay is quantised, not linear. */
const WORKING_DAYS_ONLY: ReadonlySet<MilestoneCode> = new Set([
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "EXPORT_RELEASED",
  "IMPORT_LODGED",
  "IMPORT_RELEASED",
]);

const CUSTOMS_ASSUMPTION = "if the corrected invoice reaches the broker today";
const CARRIER_ROUND_ASSUMPTION = "if the carrier releases the goods for that round";
const CARRIER_TODAY_ASSUMPTION = "if the carrier releases the goods today";

type Point = { at: Instant; precision: Precision };

function stepLabel(code: MilestoneCode, place: Place): string {
  switch (code) {
    case "BOOKED":
      return "Booking";
    case "PICKED_UP":
      return `Pickup at ${place.name}`;
    case "HUB_IN":
      return `Into the ${place.name} hub`;
    case "HUB_OUT":
      return `Out of the ${place.name} hub`;
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    case "GATE_IN":
      return `Gate-in at ${place.name}`;
    case "EXPORT_RELEASED":
      return "Export customs release";
    case "LOADED":
      return "Loaded on board";
    case "VESSEL_DEPARTED":
      return `Vessel sails from ${place.name}`;
    case "VESSEL_ARRIVED":
      return `Vessel berths at ${place.name}`;
    case "DISCHARGED":
      return "Discharge";
    case "IMPORT_LODGED":
      return "Import entry lodged";
    case "IMPORT_RELEASED":
      return "Import customs release";
    case "GATE_OUT":
      return `Gate-out at ${place.name}`;
    case "DELIVERED":
      return `Delivery in ${place.name}`;
    default:
      return assertNever(code);
  }
}

/** What has to be confirmed for the estimate to stop moving, completing "Firms up when ...". */
function firmingEvent(code: MilestoneCode, place: Place): string {
  switch (code) {
    case "BOOKED":
      return "the booking is confirmed";
    case "PICKED_UP":
      return "the cargo is picked up";
    case "HUB_IN":
      return `the cargo is scanned into the ${place.name} hub`;
    case "HUB_OUT":
      return `the cargo leaves the ${place.name} hub`;
    case "OUT_FOR_DELIVERY":
      return "the delivery round starts";
    case "GATE_IN":
      return "the container enters the terminal";
    case "EXPORT_RELEASED":
      return "export customs releases the cargo";
    case "LOADED":
      return "the container is loaded on board";
    case "VESSEL_DEPARTED":
      return "the vessel sails";
    case "VESSEL_ARRIVED":
      return "the vessel berths";
    case "DISCHARGED":
      return "the container is discharged";
    case "IMPORT_LODGED":
      return "the import entry is lodged";
    case "IMPORT_RELEASED":
      return "import customs releases the cargo";
    case "GATE_OUT":
      return "the container leaves the terminal";
    case "DELIVERED":
      return "the delivery is confirmed";
    default:
      return assertNever(code);
  }
}

function withheldReason(expectation: Expectation, input: EstimatorInput): string {
  const { reason } = expectation;
  if (reason.kind === "telematics_silence") {
    const name =
      input.operators.find((operator) => operator.id === reason.source)?.name ?? reason.source;
    const hours = Math.floor((input.now - reason.lastSignalAt) / HOUR);
    return `no position from ${name} for ${hours} h`;
  }
  const { milestone, expected } = reason;
  const when = formatStamp(expected.at, expected.precision, milestone.place.zone);
  return `${reportNoun(milestone.code)} at ${milestone.place.name}, expected ${when}, has not been reported`;
}

/** A day is kept at noon UTC, so that it reads as the same date wherever it is looked at. */
function normalise(at: Instant, precision: Precision, zone: Zone): Point {
  return precision === "day"
    ? { at: dayInstant(localDate(at, zone)), precision }
    : { at, precision };
}

/** Days are compared as days: a day-precision value has no time of day to compare. */
function isLater(a: Point, b: Point, zone: Zone): boolean {
  if (a.precision === "minute" && b.precision === "minute") return a.at > b.at;
  return localDate(a.at, zone) > localDate(b.at, zone);
}

function onWorkingDay(point: Point, zone: Zone): Point {
  const day = localDate(point.at, zone);
  if (isWorkingDay(day)) return point;
  const monday = nextWorkingDay(day);
  return point.precision === "day"
    ? { at: dayInstant(monday), precision: "day" }
    : { at: instantAt(monday, localTime(point.at, zone), zone), precision: "minute" };
}

/** The milestone customs is holding back: the import release once the vessel has sailed. */
function customsRelease(input: EstimatorInput): MilestoneCode {
  const sailed = findMilestone(input.timeline, "VESSEL_DEPARTED")?.actual !== undefined;
  return sailed ? "IMPORT_RELEASED" : "EXPORT_RELEASED";
}

function nextDeparture(shipment: Shipment, milestoneKey: string, now: Instant): Instant | null {
  const departures = shipment.deadlines
    .filter((deadline) => deadline.kind === "next_departure" && deadline.at >= now)
    .sort((a, b) => a.at - b.at);
  return departures.find((deadline) => deadline.milestoneKey === milestoneKey)?.at ?? null;
}

function estimate(input: EstimatorInput): EstelaEstimate {
  const { shipment, timeline, now } = input;

  const expectation = nextExpectation(timeline);
  if (expectation && now > expectation.by) {
    return { withheld: true, reason: withheldReason(expectation, input) };
  }

  const planned = milestonesOf(timeline).filter((entry) => !entry.unplanned);
  const lastDone = planned.findLastIndex((entry) => entry.actual !== undefined);
  const remaining = planned.slice(lastDone + 1);
  const first = remaining[0];
  if (!first) return { withheld: true, reason: "the shipment has been delivered" };

  const holds = openHolds(timeline);
  const customsHeld = holds.some((hold) => hold.hold === "customs");
  const carrierHeld = holds.some((hold) => hold.hold === "carrier");
  const releaseCode = customsRelease(input);
  const carrierRound = carrierHeld
    ? shipment.deadlines
        .filter((deadline) => deadline.kind === "next_departure" && deadline.at >= now)
        .sort((a, b) => a.at - b.at)[0]
    : undefined;
  // The round restarts the milestone it is attached to, or the very next one when it names none.
  const restartKey =
    remaining.find((entry) => entry.key === carrierRound?.milestoneKey)?.key ?? first.key;

  // A booking is paperwork, not movement: a late confirmation does not push the truck. The
  // chain is anchored on the last thing that physically or legally happened to the cargo.
  const anchor = planned[lastDone];
  let previous: { entry: MilestoneEntry; point: Point } | null =
    anchor?.actual && anchor.code !== "BOOKED"
      ? { entry: anchor, point: { at: anchor.actual.at, precision: anchor.actual.precision } }
      : null;

  let assumption: string | undefined;
  const steps: EstimateStep[] = [];

  for (const entry of remaining) {
    if (!entry.planned) continue;
    const zone = entry.place.zone;
    const declared = entry.operatorEstimate;
    let point: Point = { at: entry.planned.at, precision: entry.planned.precision };
    let from: EstimateStepSource = "lane_plan";

    if (SCHEDULE_ANCHORS.has(entry.code)) {
      from = "vessel_schedule";
      if (declared) {
        point = { at: declared.at, precision: declared.precision };
        from = "operator_estimate";
      }
    } else {
      if (previous?.entry.planned) {
        const gap = entry.planned.at - previous.entry.planned.at;
        point = normalise(previous.point.at + gap, entry.planned.precision, zone);
      }
      if (declared && isLater(declared, point, zone)) {
        point = { at: declared.at, precision: declared.precision };
        from = "operator_estimate";
      }
    }

    if (point.precision === "minute" && now - point.at > MISSED_DEPARTURE) {
      const departure = nextDeparture(shipment, entry.key, now);
      if (departure !== null) {
        point = { at: departure, precision: "minute" };
        from = "next_departure";
      }
    }

    if (customsHeld && entry.code === releaseCode) {
      const releaseDay = nextWorkingDay(localDate(now, zone));
      const release: Point =
        point.precision === "day"
          ? { at: dayInstant(releaseDay), precision: "day" }
          : { at: instantAt(releaseDay, "12:00", zone), precision: "minute" };
      if (isLater(release, point, zone)) {
        point = release;
        from = "assumption";
      }
      assumption = CUSTOMS_ASSUMPTION;
    }

    if (carrierHeld && entry.key === restartKey) {
      if (carrierRound && isLater({ at: carrierRound.at, precision: "minute" }, point, zone)) {
        point = normalise(carrierRound.at, point.precision, zone);
        from = "next_departure";
      }
      assumption = carrierRound ? CARRIER_ROUND_ASSUMPTION : CARRIER_TODAY_ASSUMPTION;
    }

    // Never in the past: what should have happened and was not reported can at best happen now.
    if (isPast(point.at, point.precision, now, zone)) {
      point = normalise(now, point.precision, zone);
      from = "assumption";
    }

    if (WORKING_DAYS_ONLY.has(entry.code)) point = onWorkingDay(point, zone);

    // The cargo cannot be somewhere before it has left where it was.
    const before = steps.at(-1);
    if (before && previous) {
      const earlier =
        point.precision === "minute" && before.precision === "minute"
          ? point.at < before.at
          : localDate(point.at, zone) < localDate(before.at, previous.entry.place.zone);
      if (earlier) {
        point = normalise(before.at, point.precision, zone);
        from = "assumption";
      }
    }

    steps.push({
      milestoneKey: entry.key,
      label: stepLabel(entry.code, entry.place),
      at: point.at,
      precision: point.precision,
      from,
    });
    previous = { entry, point };
  }

  const door = steps.at(-1);
  if (!door) return { withheld: true, reason: "the booking has no plan to estimate from" };

  const doorDay = localDate(door.at, destinationZone(shipment));
  const releaseAhead = remaining.some((entry) => entry.code === "IMPORT_RELEASED");
  const result: Estimate = {
    withheld: false,
    at: dayInstant(doorDay),
    precision: "day",
    window: {
      earliest: dayInstant(doorDay),
      // Customs may take a second working day: the one variable nobody on the lane controls.
      latest: dayInstant(releaseAhead ? nextWorkingDay(doorDay) : doorDay),
    },
    steps,
    ...(assumption ? { assumption } : {}),
    firmsUpWhen: firmingEvent(first.code, first.place),
    basis: ESTIMATE_BASIS,
    computedAt: now,
  };
  return result;
}

/**
 * Stands in for a learned, per-lane model. It propagates the plan's own gaps from the last
 * confirmed milestone, lets operator estimates and vessel schedules override them, and restarts
 * the chain at the next departure when one was missed. A pure function of its input: the same
 * shipment at the same instant always gets the same answer.
 */
export const ruleBasedEstimator: EtaEstimator = {
  estimate: (input) => Promise.resolve(estimate(input)),
};
