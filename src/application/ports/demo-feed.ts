import type { LoggedEvent, RawMessage } from "@/domain/log";
import type { Instant } from "@/domain/time";

export type DemoEventStatus = {
  id: string;
  /** Who sends what: "Noray Lines · NORAY ALTAIR delayed at Veracruz". */
  label: string;
  state: "ready" | "sent" | "blocked";
  /** For a blocked event, what has to happen first. */
  reason?: string;
};

/** What the feed needs to know about the log to say which of its events can be sent. */
export type LogView = {
  events(): readonly LoggedEvent[];
  raw(id: string): RawMessage | undefined;
};

/**
 * The operator traffic of the demo: a script of raw messages sent one event at a time. In
 * production its place is taken by one connector per operator.
 */
export interface DemoFeed {
  /** "Sent" and "blocked" are read from the log, so every tab agrees. */
  events(log: LogView): DemoEventStatus[];
  /** The raw messages of an event as they would be received at `now`; empty for an unknown id. */
  messages(id: string, now: Instant): RawMessage[];
}
