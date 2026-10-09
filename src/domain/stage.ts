import type { MilestoneCode, Place } from "./shipment";
import { findMilestone, milestonesOf, openHolds, type Timeline } from "./timeline";

/** Where the cargo physically is. Whether it will arrive on time is a separate question: health. */
export type Stage =
  | "booked"
  | "in_transit"
  | "at_origin_port"
  | "at_sea"
  | "at_destination_port"
  | "final_leg"
  | "out_for_delivery"
  | "delivered";

/** Customs gates are absent on purpose: a pre-lodged import entry must not put a vessel at sea "at customs". */
const STAGE_AFTER: Partial<Record<MilestoneCode, Stage>> = {
  BOOKED: "booked",
  PICKED_UP: "in_transit",
  HUB_IN: "in_transit",
  HUB_OUT: "in_transit",
  GATE_IN: "at_origin_port",
  LOADED: "at_origin_port",
  VESSEL_DEPARTED: "at_sea",
  VESSEL_ARRIVED: "at_destination_port",
  DISCHARGED: "at_destination_port",
  GATE_OUT: "final_leg",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
};

/**
 * The furthest confirmed physical milestone in timeline order decides. Order, not time: a late
 * old event can fill a gap but can never move the stage backwards.
 */
export function stageOf(timeline: Timeline): Stage {
  let stage: Stage = "booked";
  for (const entry of milestonesOf(timeline)) {
    const reached = entry.actual ? STAGE_AFTER[entry.code] : undefined;
    if (reached) stage = reached;
  }
  return stage;
}

/**
 * The vessel has sailed once its departure or anything planned after it is confirmed: a departure
 * that nobody reported is a gap in the reports, not a vessel still at the quay.
 */
export function hasSailed(timeline: Timeline): boolean {
  const planned = milestonesOf(timeline).filter((entry) => !entry.unplanned);
  const departure = planned.findIndex((entry) => entry.code === "VESSEL_DEPARTED");
  return departure !== -1 && planned.slice(departure).some((entry) => entry.actual !== undefined);
}

export type ImportGateState = "not_lodged" | "lodged" | "held" | "released";
export type ImportGate = { state: ImportGateState; place: Place };

/**
 * The import gate, for shipments that have one. A customs hold belongs to it once the vessel has
 * sailed: before that, customs can only be holding the export side.
 */
export function importGateOf(timeline: Timeline): ImportGate | null {
  const port = timeline.sections.find(
    ({ section }) => section.kind === "port" && section.gate === "import",
  );
  if (!port || port.section.kind !== "port") return null;
  const place = port.section.place;

  const sailed = hasSailed(timeline);
  const held = sailed && openHolds(timeline).some((hold) => hold.hold === "customs");
  if (held) return { state: "held", place };
  if (findMilestone(timeline, "IMPORT_RELEASED")?.actual) return { state: "released", place };
  if (findMilestone(timeline, "IMPORT_LODGED")?.actual) return { state: "lodged", place };
  return { state: "not_lodged", place };
}
