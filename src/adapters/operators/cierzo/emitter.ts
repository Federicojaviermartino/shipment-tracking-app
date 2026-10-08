import type { Observation } from "@/domain/ingestion";
import type { Place } from "@/domain/shipment";
import { dayOf, localDate, localTime, type Instant } from "@/domain/time";
import { formatSpanishDate } from "../shared";
import {
  CIERZO_INCIDENT,
  CIERZO_INCIDENT_RESOLVED,
  CIERZO_MILESTONES,
  CIERZO_ZONE,
} from "./mapping";

export type CierzoEmission = {
  expedicion: string;
  observation: Observation;
  occurredAt: Instant;
  /** The platform that keyed the row, for rows whose observation names no place. */
  plaza?: Place;
  /** The carrier's own words, as they go in the remark column. */
  remark?: string;
};

function status(emission: CierzoEmission): { code: string; text: string; remark: string } {
  const { observation, remark } = emission;
  switch (observation.type) {
    case "milestone": {
      const entry = Object.entries(CIERZO_MILESTONES).find(
        ([, mapped]) => mapped.milestone === observation.code,
      );
      if (!entry) break;
      return { code: entry[0], text: entry[1].text, remark: remark ?? "" };
    }
    case "hold":
      return observation.state === "raised"
        ? { ...CIERZO_INCIDENT, remark: remark ?? "MERCANCÍA RETENIDA" }
        : { ...CIERZO_INCIDENT_RESOLVED, remark: remark ?? "" };
    case "estimate": {
      if (observation.code !== "DELIVERED") break;
      const [, month, day] = dayOf(observation.at).split("-");
      return { ...CIERZO_INCIDENT, remark: `NUEVA ENTREGA PREVISTA ${day}/${month}` };
    }
    case "note":
      return { ...CIERZO_INCIDENT, remark: observation.text };
    default:
      break;
  }
  throw new Error(`Cierzo has no status for ${JSON.stringify(observation)}`);
}

/** One line of Cierzo's batch file, for the seed data. */
export function emitCierzo(emission: CierzoEmission): string {
  const { observation, occurredAt } = emission;
  const place =
    (observation.type === "milestone" ? observation.place : undefined) ?? emission.plaza;
  if (!place) throw new Error("A Cierzo row needs a plaza");
  const { code, text, remark } = status(emission);
  const date = formatSpanishDate(localDate(occurredAt, CIERZO_ZONE));
  const time = localTime(occurredAt, CIERZO_ZONE);
  const plaza = place.name.toLocaleUpperCase("es");
  return [emission.expedicion, code, text, plaza, `${date} ${time}`, remark].join(";");
}
