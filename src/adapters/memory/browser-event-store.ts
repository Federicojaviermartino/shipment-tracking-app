import type { Batch, EventStore, Unprocessed, Unsubscribe } from "@/application/ports/event-store";
import type { LoggedEvent, RawMessage } from "@/domain/log";
import { HOUR } from "@/domain/time";
import { LogState, type LogContents } from "./log-state";

/** The calls of the Web Storage API the store needs: injected, so a test can stand in for it. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

export type BrowserEventStoreOptions = {
  storage: KeyValueStorage;
  /**
   * Calls back when another tab has written to the storage, with the key it wrote (`null` when
   * the storage was cleared). In a browser this is the `storage` event of the window.
   */
  onExternalChange: (listener: (key: string | null) => void) => Unsubscribe;
  /** Real time, in epoch milliseconds: a session is dated by the wall clock, not the demo clock. */
  wallClock: () => number;
  key?: string;
};

/** Bumped whenever the shape of a logged event changes: an older session is then discarded. */
export const SESSION_VERSION = 1;
export const MAX_SESSION_AGE = 6 * HOUR;
export const DEFAULT_SESSION_KEY = "estela.session";

type Session = LogContents & { version: number; startedAt: number };

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.version === "number" &&
    typeof record.startedAt === "number" &&
    Array.isArray(record.raws) &&
    Array.isArray(record.events) &&
    Array.isArray(record.unprocessed)
  );
}

/**
 * The log of a browser session. The seed is rebuilt at every start-up and stays in memory; what
 * is appended afterwards (operator events sent from the demo bar, our own commands) is written to
 * storage under one key, together with the real time the session started. Another tab that
 * writes the key is heard through `onExternalChange`, so operations and the portal can sit side
 * by side and a reload does not lose the demo.
 */
export class BrowserEventStore implements EventStore {
  private readonly log = new LogState();
  private readonly listeners = new Set<() => void>();
  private readonly key: string;
  private startedAt: number;

  constructor(private readonly options: BrowserEventStoreOptions) {
    this.key = options.key ?? DEFAULT_SESSION_KEY;
    this.startedAt = options.wallClock();
    this.pull();
    options.onExternalChange((key) => {
      if (key !== null && key !== this.key) return;
      if (this.pull()) this.notify();
    });
  }

  /** When the session started, in real time: the demo clock counts from here. */
  sessionStartedAt(): number {
    return this.startedAt;
  }

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
    // Another tab may have appended since the last notification reached this one.
    this.pull();
    if (!this.log.append(batch)) return;
    this.push();
    this.notify();
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Starts a new session, here and in every other tab. */
  reset(): void {
    this.startSession();
    this.notify();
  }

  private startSession(): void {
    this.startedAt = this.options.wallClock();
    this.log.replaceAppended({ raws: [], events: [], unprocessed: [] });
    this.push();
  }

  /**
   * Takes over what storage holds and says whether that changed anything here: the log, or the
   * session itself. A missing, unreadable, outdated or expired session starts anew.
   */
  private pull(): boolean {
    const session = this.read();
    if (!session) {
      this.startSession();
      return true;
    }
    const restarted = session.startedAt !== this.startedAt;
    this.startedAt = session.startedAt;
    return this.log.replaceAppended(session) || restarted;
  }

  private read(): Session | null {
    let parsed: unknown;
    try {
      const stored = this.options.storage.getItem(this.key);
      if (stored === null) return null;
      parsed = JSON.parse(stored);
    } catch {
      return null;
    }
    if (!isSession(parsed) || parsed.version !== SESSION_VERSION) return null;
    const age = this.options.wallClock() - parsed.startedAt;
    return age >= 0 && age <= MAX_SESSION_AGE ? parsed : null;
  }

  private push(): void {
    const session: Session = {
      version: SESSION_VERSION,
      startedAt: this.startedAt,
      ...this.log.appendedContents(),
    };
    try {
      this.options.storage.setItem(this.key, JSON.stringify(session));
    } catch {
      // Storage is full or switched off: the session goes on in the memory of this tab.
    }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
