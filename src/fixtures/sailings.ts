import type { SeedMessage } from "./feed";
import { norayVoyageFeed } from "./feed";
import type { Sailing } from "./lanes/ocean";
import { VALENCIA_PORT, VERACRUZ_PORT } from "./places";

/** Noray Lines, Valencia to Veracruz: a Friday sailing every week, fourteen days at sea. */
export const VEGA_610W: Sailing = {
  vessel: "NORAY VEGA",
  voyage: "610W",
  sails: "2026-09-11",
  arrives: "2026-09-25",
};
export const CASTOR_611W: Sailing = {
  vessel: "NORAY CASTOR",
  voyage: "611W",
  sails: "2026-09-18",
  arrives: "2026-10-02",
};
export const ALTAIR_612W: Sailing = {
  vessel: "NORAY ALTAIR",
  voyage: "612W",
  sails: "2026-09-25",
  arrives: "2026-10-09",
};
export const DENEB_614W: Sailing = {
  vessel: "NORAY DENEB",
  voyage: "614W",
  sails: "2026-10-09",
  arrives: "2026-10-23",
};

const vega = norayVoyageFeed(VEGA_610W);
const castor = norayVoyageFeed(CASTOR_611W);
const altair = norayVoyageFeed(ALTAIR_612W);

/**
 * Vessel events name a vessel and a voyage, never a shipment: each one is sent once and fans out
 * to every box aboard. NORAY DENEB has not sailed yet, so it has said nothing.
 */
export const VESSEL_MESSAGES: SeedMessage[] = [
  vega.departed(VALENCIA_PORT, "2026-09-11 21:10"),
  vega.arrived(VERACRUZ_PORT, "2026-09-25 05:50"),
  castor.departed(VALENCIA_PORT, "2026-09-18 20:55"),
  castor.arrived(VERACRUZ_PORT, "2026-10-02 05:40"),
  altair.departed(VALENCIA_PORT, "2026-09-25 21:40"),
  altair.arrivalEstimate(VERACRUZ_PORT, "2026-10-09 06:00", "2026-10-05 07:00"),
];
