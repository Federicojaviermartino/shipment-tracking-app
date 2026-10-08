import type { Operator } from "@/domain/directory";
import type { EstelaEstimate } from "@/domain/estimate";
import type { Shipment } from "@/domain/shipment";
import type { Instant } from "@/domain/time";
import type { Timeline } from "@/domain/timeline";

export type EstimatorInput = {
  shipment: Shipment;
  timeline: Timeline;
  now: Instant;
  /** For the words of a withheld estimate, which name who has gone silent. */
  operators: readonly Operator[];
};

/**
 * The model behind every Estela estimate. It answers with a day, a window and the chain of steps
 * behind it, or it withholds and says why. It is never asked about a delivered shipment.
 */
export interface EtaEstimator {
  estimate(input: EstimatorInput): Promise<EstelaEstimate>;
}
