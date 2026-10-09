import { withoutAccents } from "./compare";
import type { Instant, LocalDate, Precision, Zone } from "./time";

export type ShipmentId = string;
export type AccountId = string;
export type SiteId = string;
export type OperatorId = string;
export type UserId = string;

/** Our own systems and people, as a source next to the operators. */
export const IBON = "IBON";
/** An operator id, or `IBON`. */
export type Source = string;

export type Country = "ES" | "FR" | "DE" | "MX";
export type Place = { name: string; country: Country; zone: Zone; locode?: string };

export const ZONE_OF_COUNTRY: Record<Country, Zone> = {
  ES: "Europe/Madrid",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  MX: "America/Mexico_City",
};

export const MILESTONE_CODES = [
  "BOOKED",
  "PICKED_UP",
  "HUB_IN",
  "HUB_OUT",
  "OUT_FOR_DELIVERY",
  "GATE_IN",
  "EXPORT_RELEASED",
  "LOADED",
  "VESSEL_DEPARTED",
  "VESSEL_ARRIVED",
  "DISCHARGED",
  "IMPORT_LODGED",
  "IMPORT_RELEASED",
  "GATE_OUT",
  "DELIVERED",
] as const;
export type MilestoneCode = (typeof MILESTONE_CODES)[number];

const CUSTOMS_GATES: ReadonlySet<MilestoneCode> = new Set([
  "EXPORT_RELEASED",
  "IMPORT_LODGED",
  "IMPORT_RELEASED",
]);

/**
 * A milestone that says where the cargo physically is. Customs is a gate at a port, not a place:
 * a release or a lodged entry never says where the cargo is, and neither does the booking.
 */
export function isPhysical(code: MilestoneCode): boolean {
  return code !== "BOOKED" && !CUSTOMS_GATES.has(code);
}

export type HoldKind = "customs" | "carrier";

export type DocumentType =
  | "commercial_invoice"
  | "packing_list"
  | "export_declaration"
  | "bill_of_lading"
  | "cmr"
  | "delivery_note"
  | "proof_of_delivery";

export type Section =
  | {
      id: string;
      kind: "road";
      operatorId: OperatorId;
      from: Place;
      to: Place;
      telematics: boolean;
    }
  | { id: string; kind: "port"; place: Place; gate?: "export" | "import" }
  | { id: string; kind: "sea"; operatorId: OperatorId; from: Place; to: Place };

export type PlannedMilestone = {
  /** `${code}@${place key}`, unique within the shipment. */
  key: string;
  code: MilestoneCode;
  /** `null` for the booking, which happens before the cargo is in any section. */
  sectionId: string | null;
  place: Place;
  plannedAt: Instant;
  precision: Precision;
  /** Who may assert it, in authority order: the first one that confirmed it gives the time. */
  reporters: Source[];
};

export type Deadline = {
  kind: "export_cutoff" | "free_time_end" | "next_departure";
  at: Instant;
  label: string;
  /** What missing it costs, when the booking says so. */
  consequence?: string;
  /** The milestone the clock protects or re-starts. */
  milestoneKey?: string;
};

export type RefKind = "expedition" | "booking" | "container" | "bill_of_lading" | "forwarder_file";
export type OperatorRef = { operatorId: OperatorId; kind: RefKind; value: string };

export type Shipment = {
  id: ShipmentId;
  /** The customer's order number. */
  orderRef: string;
  accountId: AccountId;
  originSiteId: SiteId;
  consignee: { name: string; place: Place };
  incoterm: { code: "DAP" | "CPT"; place: string };
  cargo: {
    description: string;
    packages: string;
    grossWeightKg: number;
    container?: { size: "20'" | "40'HC"; number: string };
  };
  /** The delivery day promised to the consignee, local to `consignee.place.zone`. */
  committedDate: LocalDate;
  sections: Section[];
  /** In timeline order: operators' clocks and precisions differ, so the plan decides the order. */
  plan: PlannedMilestone[];
  refs: OperatorRef[];
  voyage?: { vessel: string; voyage: string };
  deadlines: Deadline[];
};

/** Case- and accent-insensitive, so "MÁLAGA" in a carrier file is the plan's "Málaga". */
export function placeKey(place: Pick<Place, "name">): string {
  return withoutAccents(place.name).trim().toUpperCase();
}

export function milestoneKey(code: MilestoneCode, place: Pick<Place, "name">): string {
  return `${code}@${placeKey(place)}`;
}

export function destinationZone(shipment: Shipment): Zone {
  return shipment.consignee.place.zone;
}

export function originPlace(shipment: Shipment): Place | undefined {
  return shipment.plan[0]?.place;
}

/**
 * The zone a deadline is read in: that of the milestone it protects. One that names no milestone
 * is read where the shipment starts.
 */
export function deadlineZone(shipment: Shipment, deadline: Deadline): Zone {
  const guarded = shipment.plan.find((milestone) => milestone.key === deadline.milestoneKey);
  return (guarded?.place ?? originPlace(shipment) ?? shipment.consignee.place).zone;
}

/**
 * DAP and CPT both leave import clearance to the buyer, wherever there is a border to clear: a
 * shipment whose route has an import gate is one its consignee clears.
 */
export function consigneeClearsImport(shipment: Shipment): boolean {
  return shipment.sections.some((section) => section.kind === "port" && section.gate === "import");
}

export function isInternational(shipment: Shipment): boolean {
  const origin = originPlace(shipment);
  return origin !== undefined && origin.country !== shipment.consignee.place.country;
}

export function hasSeaLeg(shipment: Shipment): boolean {
  return shipment.sections.some((section) => section.kind === "sea");
}

/** Every operator with a part in the shipment: it carries a section, reports a milestone or holds a reference. */
export function operatorsOf(shipment: Shipment): OperatorId[] {
  const ids = new Set<OperatorId>();
  for (const section of shipment.sections) {
    if (section.kind !== "port") ids.add(section.operatorId);
  }
  for (const milestone of shipment.plan) {
    for (const reporter of milestone.reporters) ids.add(reporter);
  }
  for (const ref of shipment.refs) ids.add(ref.operatorId);
  ids.delete(IBON);
  return [...ids];
}
