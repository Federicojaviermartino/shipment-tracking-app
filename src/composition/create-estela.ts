import { grammarQueryInterpreter } from "@/adapters/ai-mock/grammar-query-interpreter";
import { withLatency } from "@/adapters/ai-mock/latency";
import { patternTextInterpreter } from "@/adapters/ai-mock/pattern-text-interpreter";
import { ruleBasedEstimator } from "@/adapters/ai-mock/rule-based-estimator";
import { templateDigestWriter } from "@/adapters/ai-mock/template-digest-writer";
import { templateMessageDrafter } from "@/adapters/ai-mock/template-message-drafter";
import { BrowserEventStore, type KeyValueStorage } from "@/adapters/memory/browser-event-store";
import { DemoClock, ManualClock } from "@/adapters/memory/clocks";
import { InMemoryEventStore } from "@/adapters/memory/in-memory-event-store";
import { ScriptedDemoFeed } from "@/adapters/memory/scripted-demo-feed";
import { OPERATOR_ADAPTERS } from "@/adapters/operators";
import type { Directory } from "@/application/directory";
import type { Estela } from "@/application/estela";
import { createGateway } from "@/application/gateway";
import { createIngestion } from "@/application/ingestion";
import type { Clock } from "@/application/ports/clock";
import type { DigestWriter } from "@/application/ports/digest-writer";
import type { EtaEstimator } from "@/application/ports/eta-estimator";
import type { EventStore } from "@/application/ports/event-store";
import type { MessageDrafter } from "@/application/ports/message-drafter";
import type { QueryInterpreter } from "@/application/ports/query-interpreter";
import type { TextInterpreter } from "@/application/ports/text-interpreter";
import type { Instant } from "@/domain/time";
import {
  ACCOUNTS,
  DEMO_EVENTS,
  demoMessageId,
  demoMessages,
  MANUFACTURER,
  OPERATORS,
  PERSONAS,
  SEED,
  SHIPMENTS,
  SITES,
  T0,
} from "@/fixtures";

/** The five AI ports. Each has a deterministic stand-in here; production swaps them one by one. */
export type AiPorts = {
  estimator: EtaEstimator;
  textInterpreter: TextInterpreter;
  digestWriter: DigestWriter;
  drafter: MessageDrafter;
  queryInterpreter: QueryInterpreter;
};

export type EstelaDeps = {
  clock: Clock;
  store: EventStore;
  /** Replaces a stand-in: a real adapter, or a failing one to prove that the product fails closed. */
  ai?: Partial<AiPorts>;
  /**
   * Added to the model calls a person waits for (asking, drafting, the sentence of the
   * briefing), so that loading states are real in the app. Estimates and readings are computed
   * when the log changes and are never waited for.
   */
  aiLatencyMs: number;
  /** Defaults to raising it as an uncaught error, which a browser and a test run both report. */
  reportError?: (error: unknown) => void;
};

function raiseUncaught(error: unknown): void {
  queueMicrotask(() => {
    throw error;
  });
}

const DIRECTORY: Directory = {
  manufacturer: MANUFACTURER,
  shipments: SHIPMENTS,
  operators: OPERATORS,
  sites: SITES,
  accounts: ACCOUNTS,
  actors: PERSONAS,
};

/**
 * The one place where ports meet adapters and the synthetic world. The seed goes through the
 * same ingestion as a live message: the application really parses raw operator text when it
 * starts. A production adapter is wired in here and nowhere else, but wiring is not all it takes:
 * the estimator port also carries wording (the labels of its steps, what it assumes, when it firms
 * up), and the playbook asks the operator first or not from the sources and the assumption an
 * estimate declares, so a replacement has to honour those too. What no adapter can undo is in the
 * application: no estimate is asked for a delivered or a stale shipment, and an estimator that
 * fails is a withheld estimate.
 */
export async function createEstela(deps: EstelaDeps): Promise<Estela> {
  const { clock, store, aiLatencyMs } = deps;
  const ai: AiPorts = {
    estimator: ruleBasedEstimator,
    textInterpreter: patternTextInterpreter,
    digestWriter: templateDigestWriter,
    drafter: templateMessageDrafter,
    queryInterpreter: grammarQueryInterpreter,
    ...deps.ai,
  };
  const ingestion = createIngestion({
    shipments: SHIPMENTS,
    adapters: OPERATOR_ADAPTERS,
    interpreter: ai.textInterpreter,
    store,
  });
  await ingestion.seed({ own: SEED.own, messages: SEED.messages });

  const demoFeed = new ScriptedDemoFeed(
    DEMO_EVENTS.map((event) => ({
      id: event.id,
      label: event.label,
      precondition: event.precondition,
      messageIds: event.bodies.map((_, index) => demoMessageId(event.id, index)),
      messages: (now: Instant) => demoMessages(event, now),
    })),
  );

  return createGateway({
    directory: DIRECTORY,
    store,
    clock,
    ingestion,
    demoFeed,
    reportError: deps.reportError ?? raiseUncaught,
    estimator: ai.estimator,
    digestWriter: {
      highlight: withLatency((facts) => ai.digestWriter.highlight(facts), aiLatencyMs),
    },
    drafter: { draft: withLatency((request) => ai.drafter.draft(request), aiLatencyMs) },
    queryInterpreter: {
      interpret: withLatency(
        (text, context) => ai.queryInterpreter.interpret(text, context),
        aiLatencyMs,
      ),
    },
  });
}

/** For a browser that refuses access to storage: the session then lives in this tab only. */
function tabStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function browserStorage(): KeyValueStorage {
  try {
    return window.localStorage;
  } catch {
    return tabStorage();
  }
}

/** The prototype as it runs in the browser. Call it once per page load, never on the server. */
export function createBrowserEstela(): Promise<Estela> {
  const store = new BrowserEventStore({
    storage: browserStorage(),
    onExternalChange: (listener) => {
      const onStorage = (event: StorageEvent) => listener(event.key);
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    wallClock: Date.now,
  });
  const clock = new DemoClock(T0, () => store.sessionStartedAt());
  return createEstela({ clock, store, aiLatencyMs: 600 });
}

/**
 * The whole core without React, for integration tests: an in-memory log, no latency and a clock
 * that stands still at `at` until the test moves it.
 */
export async function createTestEstela(
  options: { at?: Instant; ai?: Partial<AiPorts>; reportError?: (error: unknown) => void } = {},
): Promise<{
  estela: Estela;
  clock: ManualClock;
  store: InMemoryEventStore;
}> {
  const clock = new ManualClock(options.at ?? T0);
  const store = new InMemoryEventStore();
  const { ai, reportError } = options;
  const estela = await createEstela({ clock, store, aiLatencyMs: 0, ai, reportError });
  return { estela, clock, store };
}
