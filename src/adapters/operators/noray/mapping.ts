import type { MilestoneCode, Place } from "@/domain/shipment";

export const NORAY = "NRY";

/** The ports of Noray's Valencia to Veracruz service, and which end of it each one is. */
export const NORAY_PORTS: Record<string, { place: Place; role: "origin" | "destination" }> = {
  ESVLC: {
    place: { name: "Valencia", country: "ES", zone: "Europe/Madrid", locode: "ESVLC" },
    role: "origin",
  },
  MXVER: {
    place: { name: "Veracruz", country: "MX", zone: "America/Mexico_City", locode: "MXVER" },
    role: "destination",
  },
};

/**
 * The same equipment code means different things depending on whether the box is laden and on the
 * facility (a gate-in can be an empty returned to a depot), so a milestone is keyed on all three.
 * Only actual events (`ACT`) of laden boxes are milestones.
 */
export const NORAY_EQUIPMENT: {
  code: string;
  role: "origin" | "destination";
  milestone: MilestoneCode;
}[] = [
  { code: "GTIN", role: "origin", milestone: "GATE_IN" },
  { code: "LOAD", role: "origin", milestone: "LOADED" },
  { code: "DISC", role: "destination", milestone: "DISCHARGED" },
  { code: "GTOT", role: "destination", milestone: "GATE_OUT" },
];

/**
 * Vessel events carry vessel and voyage, never a container: they are shared by every box aboard.
 * A vessel arrives and departs at both ends of a voyage, so these are keyed on the port too: the
 * departure that counts is the one from the port of loading, the arrival the one at the port of
 * discharge.
 */
export const NORAY_TRANSPORT: {
  code: string;
  classifier: "ACT" | "EST";
  role: "origin" | "destination";
  milestone: MilestoneCode;
}[] = [
  { code: "DEPA", classifier: "ACT", role: "origin", milestone: "VESSEL_DEPARTED" },
  { code: "ARRI", classifier: "ACT", role: "destination", milestone: "VESSEL_ARRIVED" },
  { code: "ARRI", classifier: "EST", role: "destination", milestone: "VESSEL_ARRIVED" },
];
