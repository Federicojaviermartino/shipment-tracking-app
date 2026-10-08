import type { Batch, EventStore, Unprocessed, Unsubscribe } from "@/application/ports/event-store";
import type { LoggedEvent, RawMessage } from "@/domain/log";
import { LogState } from "./log-state";

/** The log of a test or of a single process: nothing outlives the instance. */
export class InMemoryEventStore implements EventStore {
  private readonly log = new LogState();
  private readonly listeners = new Set<() => void>();

  events(): readonly LoggedEvent[] {
    return this.log.events();
  }

  raw(id: string): RawMessage | undefined {
    return this.log.raw(id);
  }

  unprocessed(): readonly Unprocessed[] {
    return this.log.unprocessed();
  }

  seed(batch: Batch): void {
    this.log.seed(batch);
  }

  append(batch: Batch): void {
    if (this.log.append(batch)) this.notify();
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    this.log.replaceAppended({ raws: [], events: [], unprocessed: [] });
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
