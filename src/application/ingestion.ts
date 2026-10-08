import { ingestItems, toLoggedEvent } from "@/domain/ingestion";
import type { LoggedEvent, RawMessage } from "@/domain/log";
import type { Shipment } from "@/domain/shipment";
import type { Batch, EventStore, Unprocessed } from "./ports/event-store";
import type { OperatorAdapter } from "./ports/operator-adapter";
import type { TextInterpreter, TextReading } from "./ports/text-interpreter";

export type IngestionDeps = {
  shipments: readonly Shipment[];
  adapters: readonly OperatorAdapter[];
  interpreter: TextInterpreter;
  store: EventStore;
};

export type Ingestion = {
  /**
   * Loads the starting state: our own records as they are, and every operator message through
   * the same translation a live message gets.
   */
  seed(input: {
    own: { raws: readonly RawMessage[]; events: readonly LoggedEvent[] };
    messages: readonly RawMessage[];
  }): Promise<void>;
  /** Takes in what an operator sent. Messages that arrive together are appended together. */
  ingest(messages: readonly RawMessage[]): Promise<void>;
};

/** Why a note stands where a reading was expected, for whoever opens the original message. */
const UNREAD_NOTE = "Free-text message that could not be read automatically: see the original";

/**
 * From raw operator text to logged events: pick the adapter, parse, hand free text to the text
 * interpreter, correlate (a vessel event fans out to every shipment aboard) and append. The
 * append is idempotent, so a redelivered message changes nothing.
 */
export function createIngestion(deps: IngestionDeps): Ingestion {
  const { shipments, adapters, interpreter, store } = deps;

  async function readOrNull(raw: RawMessage, text: string): Promise<TextReading | null> {
    try {
      return await interpreter.read({ operatorId: raw.operatorId, text });
    } catch {
      return null;
    }
  }

  async function translate(raw: RawMessage): Promise<Required<Batch>> {
    const reject = (reason: Unprocessed["reason"], detail: string): Required<Batch> => ({
      raws: [raw],
      events: [],
      unprocessed: [{ rawId: raw.id, reason, detail }],
    });

    const adapter = adapters.find((candidate) => candidate.operatorId === raw.operatorId);
    if (!adapter) return reject("quarantined", `no adapter for operator "${raw.operatorId}"`);
    const parsed = adapter.parse(raw);
    if (!parsed.ok) return reject("quarantined", parsed.reason);

    const { events, unread, orphans } = ingestItems(shipments, raw, parsed.items);
    const readings: LoggedEvent[] = [];
    for (const { shipment, ref, text } of unread) {
      // Fail closed: a reader that breaks leaves the message as an unread note, never as a fact.
      const reading = await readOrNull(raw, text);
      readings.push(
        reading
          ? toLoggedEvent({
              shipment,
              raw,
              ref,
              observation: reading.observation,
              reading: { method: "ai", rule: reading.rule },
            })
          : toLoggedEvent({
              shipment,
              raw,
              ref,
              observation: { type: "note", text: UNREAD_NOTE },
              reading: { method: "table", rule: "free text:not read" },
            }),
      );
    }

    // An unknown reference never attaches by guess: the message is kept and nothing is derived.
    const unprocessed: Unprocessed[] =
      orphans.length > 0
        ? [
            {
              rawId: raw.id,
              reason: "orphan",
              detail: `${orphans.length} item${orphans.length === 1 ? "" : "s"} matched no shipment`,
            },
          ]
        : [];
    return { raws: [raw], events: [...events, ...readings], unprocessed };
  }

  async function translateAll(messages: readonly RawMessage[]): Promise<Required<Batch>> {
    const batches = [];
    for (const raw of messages) batches.push(await translate(raw));
    return {
      raws: batches.flatMap((batch) => batch.raws),
      events: batches.flatMap((batch) => batch.events),
      unprocessed: batches.flatMap((batch) => batch.unprocessed),
    };
  }

  return {
    async seed({ own, messages }) {
      store.seed({ raws: own.raws, events: own.events });
      store.seed(await translateAll(messages));
    },
    async ingest(messages) {
      store.append(await translateAll(messages));
    },
  };
}
