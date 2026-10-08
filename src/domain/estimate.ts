import type { Instant, Precision } from "./time";

/**
 * Where a step of the chain got its time. `operator_estimate`, `vessel_schedule` and `lane_plan`
 * carry forward what operators and the booking said. `next_departure` and `assumption` are the
 * estimator's own inferences: a missed departure, a release it assumes, an overdue milestone it
 * had to move to "now".
 */
export type EstimateStepSource =
  "operator_estimate" | "vessel_schedule" | "lane_plan" | "next_departure" | "assumption";

export type EstimateStep = {
  milestoneKey: string;
  label: string;
  at: Instant;
  precision: Precision;
  from: EstimateStepSource;
};

/** An Estela estimate: a door time, the window around it and the chain of steps behind it. */
export type Estimate = {
  withheld: false;
  at: Instant;
  precision: Precision;
  window: { earliest: Instant; latest: Instant };
  steps: EstimateStep[];
  assumption?: string;
  firmsUpWhen?: string;
  /** How it was computed, as shown to operations: "Rule-based estimate". */
  basis: string;
  computedAt: Instant;
};

/** The estimator declining to answer is an answer: unknown is shown as unknown. */
export type Withheld = { withheld: true; reason: string };

export type EstelaEstimate = Estimate | Withheld;

/**
 * `declared` when the chain only carries operator statements through the lane plan, `inferred`
 * as soon as one step rests on something the estimator worked out by itself. The difference
 * decides whether a customer is told at once or the operator is asked first.
 */
export function estimateBasis(estimate: Estimate): "declared" | "inferred" {
  const inferred =
    estimate.assumption !== undefined ||
    estimate.steps.some((step) => step.from === "next_departure" || step.from === "assumption");
  return inferred ? "inferred" : "declared";
}
