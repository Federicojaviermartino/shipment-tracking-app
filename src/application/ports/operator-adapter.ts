import type { ParseResult } from "@/domain/ingestion";
import type { RawMessage } from "@/domain/log";
import type { OperatorId } from "@/domain/shipment";

/**
 * The anti-corruption boundary towards one operator: its formats, codes and languages stop here.
 * `parse` never throws; a payload it cannot read comes back quarantined with the reason.
 */
export interface OperatorAdapter {
  readonly operatorId: OperatorId;
  parse(raw: RawMessage): ParseResult;
  /**
   * For an operator that sends files: the data rows of a message, each as text that reads on its
   * own. Ingestion then keeps one message per row. An operator that sends one fact per message
   * leaves it out.
   */
  rows?(raw: RawMessage): string[];
}
