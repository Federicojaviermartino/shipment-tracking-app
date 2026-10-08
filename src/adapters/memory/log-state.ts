import type { Batch, Unprocessed } from "@/application/ports/event-store";
import { eventId, type LoggedEvent, type RawMessage } from "@/domain/log";

/** The part of a log that can be written out and read back. */
export type LogContents = {
  raws: RawMessage[];
  events: LoggedEvent[];
  unprocessed: Unprocessed[];
};

type Part = {
  raws: Map<string, RawMessage>;
  events: Map<string, LoggedEvent>;
  unprocessed: Unprocessed[];
};

function emptyPart(): Part {
  return { raws: new Map(), events: new Map(), unprocessed: [] };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * The state both event stores share: a seed that never changes after start-up and what was
 * appended since, each record kept once. It knows nothing about listeners or persistence.
 */
export class LogState {
  private readonly seeded = emptyPart();
  private appended = emptyPart();
  private all: readonly LoggedEvent[] | null = null;

  /** The same array until the log changes, so a caller can tell "unchanged" by identity. */
  events(): readonly LoggedEvent[] {
    this.all ??= [...this.seeded.events.values(), ...this.appended.events.values()];
    return this.all;
  }

  raw(id: string): RawMessage | undefined {
    return this.seeded.raws.get(id) ?? this.appended.raws.get(id);
  }

  unprocessed(): readonly Unprocessed[] {
    return [...this.seeded.unprocessed, ...this.appended.unprocessed];
  }

  seed(batch: Batch): void {
    this.add(this.seeded, batch);
  }

  /** Whether the batch held anything that was not already in the log. */
  append(batch: Batch): boolean {
    return this.add(this.appended, batch);
  }

  appendedContents(): LogContents {
    return {
      raws: [...this.appended.raws.values()],
      events: [...this.appended.events.values()],
      unprocessed: [...this.appended.unprocessed],
    };
  }

  /**
   * Takes over a list read back from storage. When it holds what is already here, nothing is
   * touched and the answer is `false`: an unchanged log must keep its identity.
   */
  replaceAppended(contents: LogContents): boolean {
    const same =
      sameIds(contents.events.map(eventId), [...this.appended.events.keys()]) &&
      sameIds(
        contents.raws.map((raw) => raw.id),
        [...this.appended.raws.keys()],
      ) &&
      contents.unprocessed.length === this.appended.unprocessed.length;
    if (same) return false;
    this.appended = emptyPart();
    this.all = null;
    this.add(this.appended, contents);
    return true;
  }

  private add(part: Part, batch: Batch): boolean {
    let added = false;
    for (const raw of batch.raws ?? []) {
      if (this.raw(raw.id) !== undefined) continue;
      part.raws.set(raw.id, raw);
      added = true;
    }
    for (const event of batch.events) {
      const id = eventId(event);
      if (this.seeded.events.has(id) || this.appended.events.has(id)) continue;
      part.events.set(id, event);
      added = true;
    }
    for (const entry of batch.unprocessed ?? []) {
      const known = this.unprocessed().some(
        (kept) => kept.rawId === entry.rawId && kept.reason === entry.reason,
      );
      if (known) continue;
      part.unprocessed.push(entry);
      added = true;
    }
    if (added) this.all = null;
    return added;
  }
}
