import type { Observation } from "@/domain/ingestion";
import { isoWithOffset, type Instant } from "@/domain/time";
import { NORAY_EQUIPMENT, NORAY_TRANSPORT } from "./mapping";

export type NorayEmission = {
  observation: Observation;
  /** When it happened. An estimate needs none: its time is the estimated one. */
  occurredAt?: Instant;
  /** Equipment events are about a container. */
  container?: string;
  /** Transport events are about a vessel and a voyage. */
  voyage?: { vessel: string; voyage: string };
  delayReasonCode?: string;
  changeRemark?: string;
};

/** One DCSA-style event, for the seed data. */
export function emitNoray(emission: NorayEmission): string {
  const { observation, container, voyage } = emission;
  if (observation.type !== "milestone" && observation.type !== "estimate") {
    throw new Error(`Noray has no event for ${JSON.stringify(observation)}`);
  }
  const { place } = observation;
  if (!place?.locode) throw new Error("A Noray event needs a port with a UN/LOCODE");
  const time = observation.type === "estimate" ? observation.at : emission.occurredAt;
  if (time === undefined) throw new Error("A Noray milestone needs the time it happened");

  const equipment = NORAY_EQUIPMENT.find((row) => row.milestone === observation.code);
  if (observation.type === "milestone" && equipment && container) {
    return JSON.stringify({
      eventType: "EQUIPMENT",
      equipmentEventTypeCode: equipment.code,
      eventClassifierCode: "ACT",
      emptyIndicatorCode: "LADEN",
      eventDateTime: isoWithOffset(time, place.zone),
      UNLocationCode: place.locode,
      equipmentReference: container,
    });
  }

  const classifier = observation.type === "milestone" ? "ACT" : "EST";
  const transport = NORAY_TRANSPORT.find(
    (row) => row.milestone === observation.code && row.classifier === classifier,
  );
  if (!transport || !voyage) {
    throw new Error(`Noray has no event for ${JSON.stringify(observation)}`);
  }
  return JSON.stringify({
    eventType: "TRANSPORT",
    transportEventTypeCode: transport.code,
    eventClassifierCode: classifier,
    eventDateTime: isoWithOffset(time, place.zone),
    UNLocationCode: place.locode,
    vesselName: voyage.vessel,
    carrierVoyageNumber: voyage.voyage,
    ...(emission.delayReasonCode ? { delayReasonCode: emission.delayReasonCode } : {}),
    ...(emission.changeRemark ? { changeRemark: emission.changeRemark } : {}),
  });
}
