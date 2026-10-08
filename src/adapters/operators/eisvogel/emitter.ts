import type { Observation } from "@/domain/ingestion";
import { isoWithOffset, type Instant, type Zone } from "@/domain/time";
import { EISVOGEL_STATUS } from "./mapping";

export type EisvogelEmission = {
  sendungsnr: string;
  observation: Observation;
  occurredAt: Instant;
  /** The zone the truck is in, for payloads whose observation names no place. */
  zone?: Zone;
  /** The delivery ETA that rides on every status payload. */
  eta?: { at: Instant; zone: Zone };
  coordinates?: { lat: number; lon: number };
  bemerkung?: string;
};

function status(observation: Observation): { status: string; statustext: string; ort: string } {
  switch (observation.type) {
    case "milestone": {
      const entry = Object.entries(EISVOGEL_STATUS).find(
        ([, meaning]) => meaning.kind === "milestone" && meaning.milestone === observation.code,
      );
      if (!entry || !observation.place) break;
      return {
        status: entry[0],
        statustext: entry[1].text,
        ort: `${observation.place.name}, ${observation.place.country}`,
      };
    }
    case "position": {
      const entry = Object.entries(EISVOGEL_STATUS).find(
        ([, meaning]) => meaning.kind === "position",
      );
      if (!entry) break;
      return { status: entry[0], statustext: entry[1].text, ort: observation.place };
    }
    default:
      break;
  }
  throw new Error(`Eisvogel has no status for ${JSON.stringify(observation)}`);
}

/** One webhook payload, for the seed data. */
export function emitEisvogel(emission: EisvogelEmission): string {
  const { observation, occurredAt, eta, coordinates, bemerkung } = emission;
  const place = observation.type === "milestone" ? observation.place : undefined;
  const zone = place?.zone ?? emission.zone ?? "Europe/Berlin";
  return JSON.stringify({
    sendungsnr: emission.sendungsnr,
    ...status(observation),
    zeit: isoWithOffset(occurredAt, zone),
    ...(coordinates ?? {}),
    ...(eta ? { eta: isoWithOffset(eta.at, eta.zone) } : {}),
    ...(bemerkung ? { bemerkung } : {}),
  });
}
