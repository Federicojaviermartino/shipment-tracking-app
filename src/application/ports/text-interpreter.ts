import type { Observation } from "@/domain/ingestion";
import type { OperatorId } from "@/domain/shipment";

export type TextReading = { observation: Observation; rule: string };

/**
 * Reads a free-text operator message into the closed vocabulary of observations. The result is
 * logged as a reading that a person must confirm; `null` means "could not read it", and the
 * message is then kept as a plain note.
 */
export interface TextInterpreter {
  read(input: { operatorId: OperatorId; text: string }): Promise<TextReading | null>;
}
