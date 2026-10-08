import type { Observation } from "@/domain/ingestion";
import { dayOf, type Instant } from "@/domain/time";
import { formatSpanishDate } from "../shared";
import { TURIA_HEADER, TURIA_REPORT, type TuriaMeaning } from "./mapping";

export type TuriaEmission = {
  expediente: string;
  /** The customer's order number, as Turia repeats it on every row. */
  refCliente: string;
  observation: Observation;
  /** The day it happened, for milestones and documents. */
  occurredAt?: Instant;
  observaciones?: string;
};

function matches(meaning: TuriaMeaning, observation: Observation): boolean {
  switch (observation.type) {
    case "milestone":
      return meaning.kind === "milestone" && meaning.milestone === observation.code;
    case "estimate":
      return meaning.kind === "estimate" && meaning.milestone === observation.code;
    case "estimate_withdrawn":
      return meaning.kind === "estimate_withdrawn" && meaning.milestone === observation.code;
    case "document":
      return meaning.kind === "document" && meaning.docType === observation.docType;
    default:
      return false;
  }
}

/** One row of Turia's daily status report under its header, for the seed data. */
export function emitTuriaRow(emission: TuriaEmission): string {
  const { observation } = emission;
  const rule = TURIA_REPORT.find((entry) => matches(entry.meaning, observation));
  if (!rule) throw new Error(`Turia's report has no row for ${JSON.stringify(observation)}`);

  let day: Instant | undefined;
  if (observation.type === "estimate") day = observation.at;
  else if (observation.type !== "estimate_withdrawn") day = emission.occurredAt;
  if (observation.type !== "estimate_withdrawn" && day === undefined) {
    throw new Error("A Turia row for a milestone or a document needs its day");
  }

  const row = [
    emission.expediente,
    emission.refCliente,
    rule.concepto,
    rule.estado,
    day === undefined ? "" : formatSpanishDate(dayOf(day)),
    emission.observaciones ?? "",
  ].join(";");
  return `${TURIA_HEADER}\n${row}`;
}
