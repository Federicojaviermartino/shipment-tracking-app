import type { LoggedEvent, RawMessage } from "@/domain/log";

export type Unsubscribe = () => void;

/** A raw message that produced nothing: it could not be parsed, or it names no shipment we know. */
export type Unprocessed = {
  rawId: string;
  reason: "quarantined" | "orphan";
  detail: string;
};

export type Batch = {
  raws?: readonly RawMessage[];
  events: readonly LoggedEvent[];
  unprocessed?: readonly Unprocessed[];
};

/**
 * The append-only log: raw operator messages kept verbatim, their canonical translation and our
 * own internal events. Everything a screen shows is derived from it on read.
 */
export interface EventStore {
  /** The same array until the log changes: its identity is the version of the log. */
  events(): readonly LoggedEvent[];
  raw(id: string): RawMessage | undefined;
  /** Messages kept but attached to nothing. Nothing reads them back into a projection. */
  unprocessed(): readonly Unprocessed[];
  /**
   * Loads the starting state. It is rebuilt at every start-up, so a store never persists it,
   * never announces it, and `reset` returns to it.
   */
  seed(batch: Batch): void;
  /** Idempotent on the event identity and on the raw message id. */
  append(batch: Batch): void;
  /** Fires after every change of the appended part, whoever made it: this tab or another one. */
  subscribe(listener: () => void): Unsubscribe;
  /** Drops everything appended since the seed. */
  reset(): void;
}
