import type { Health } from "./exceptions";
import type { DocumentType, HoldKind, MilestoneCode } from "./shipment";
import type { Stage } from "./stage";

/** A count with its noun: "1 day", "2 days". */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** One vocabulary for code, screens and documents. */
export const MILESTONE_LABEL: Record<MilestoneCode, string> = {
  BOOKED: "Booked",
  PICKED_UP: "Picked up",
  HUB_IN: "Arrived at hub",
  HUB_OUT: "Left hub",
  OUT_FOR_DELIVERY: "Out for delivery",
  GATE_IN: "Gate-in at the origin terminal",
  EXPORT_RELEASED: "Export customs released",
  LOADED: "Loaded on board",
  VESSEL_DEPARTED: "Vessel departed",
  VESSEL_ARRIVED: "Vessel arrived",
  DISCHARGED: "Discharged",
  IMPORT_LODGED: "Import entry lodged",
  IMPORT_RELEASED: "Import customs released",
  GATE_OUT: "Gate-out from the destination terminal",
  DELIVERED: "Delivered",
};

export const STAGE_LABEL: Record<Stage, { ops: string; customer: string }> = {
  booked: { ops: "Booked", customer: "Being prepared" },
  in_transit: { ops: "In transit", customer: "On the way" },
  at_origin_port: { ops: "At origin port", customer: "At the port of departure" },
  at_sea: { ops: "At sea", customer: "At sea" },
  at_destination_port: { ops: "At destination port", customer: "At the port of arrival" },
  final_leg: { ops: "On final leg", customer: "On the way to you" },
  out_for_delivery: { ops: "Out for delivery", customer: "Out for delivery" },
  delivered: { ops: "Delivered", customer: "Delivered" },
};

export const HEALTH_LABEL: Record<Health, string> = {
  held: "Held",
  delayed: "Delayed",
  at_risk: "At risk",
  stale: "Stale",
  on_time: "On time",
  delivered: "Delivered",
};

export const HOLD_LABEL: Record<HoldKind, { ops: string; customer: string }> = {
  customs: { ops: "Customs hold", customer: "Held at customs" },
  carrier: { ops: "Carrier hold", customer: "On hold with the carrier" },
};

export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  commercial_invoice: "Commercial invoice",
  packing_list: "Packing list",
  export_declaration: "Export declaration",
  bill_of_lading: "Bill of lading",
  cmr: "CMR consignment note",
  delivery_note: "Delivery note",
  proof_of_delivery: "Proof of delivery",
};
