import type { EstelaEstimate } from "@/domain/estimate";
import type { Shipment } from "@/domain/shipment";
import type { Instant } from "@/domain/time";
import type { Timeline } from "@/domain/timeline";

export type EstimatorInput = {
  shipment: Shipment;
  timeline: Timeline;
  now: Instant;
};

/**
 * The model behind every Estela estimate. It answers with a day, a window and the chain of steps
 * behind it, or it withholds and says why. The application stands guard around it: it is never
 * asked about a delivered shipment nor about one that owes an update, and if it rejects, the
 * estimate is withheld as unavailable.
 */
export interface EtaEstimator {
  estimate(input: EstimatorInput): Promise<EstelaEstimate>;
}
