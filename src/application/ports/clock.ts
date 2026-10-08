import type { Instant } from "@/domain/time";

/** The only source of "now" below the UI, so that every rule can be run at a chosen instant. */
export interface Clock {
  now(): Instant;
}
