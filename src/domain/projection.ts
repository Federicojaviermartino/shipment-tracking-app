import { selectDates, type ShipmentDates } from "./dates";
import { documentStatuses, type RequiredDocument } from "./documents";
import type { EstelaEstimate } from "./estimate";
import { detectExceptions, healthOf, type Health, type ShipmentException } from "./exceptions";
import type { LoggedEvent } from "./log";
import { primaryException } from "./queue";
import type { Shipment } from "./shipment";
import { importGateOf, stageOf, type ImportGate, type Stage } from "./stage";
import { buildTimeline } from "./fold";
import type { Timeline } from "./timeline";
import type { Instant } from "./time";

/** Everything derived about one shipment at one instant. Nothing in it is stored anywhere. */
export type ShipmentProjection = {
  shipment: Shipment;
  timeline: Timeline;
  stage: Stage;
  importGate: ImportGate | null;
  dates: ShipmentDates;
  documents: RequiredDocument[];
  exceptions: ShipmentException[];
  primary: ShipmentException | null;
  health: Health;
  customsHold: boolean;
};

/**
 * Derives a shipment from the log in one pass. The estimate is an argument because computing it
 * is the estimator's job; pass `null` when there is none. A caller that already folded the
 * timeline, to feed the estimator, hands it back instead of paying for the fold twice.
 */
export function projectShipment(input: {
  shipment: Shipment;
  events: readonly LoggedEvent[];
  estimate: EstelaEstimate | null;
  now: Instant;
  timeline?: Timeline;
}): ShipmentProjection {
  const { shipment, events, estimate, now } = input;
  const timeline = input.timeline ?? buildTimeline(shipment, events);
  const dates = selectDates(shipment, timeline, estimate, events, now);
  const exceptions = detectExceptions(shipment, timeline, dates, events, now);
  return {
    shipment,
    timeline,
    stage: stageOf(timeline),
    importGate: importGateOf(timeline),
    dates,
    documents: documentStatuses(shipment, timeline, events),
    exceptions,
    primary: primaryException(exceptions),
    health: healthOf(timeline, exceptions),
    customsHold: exceptions.some((exception) => exception.type === "customs_hold"),
  };
}
