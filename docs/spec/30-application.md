# Estela — specification, part 3: application layer, adapters, composition

## 1. Driven ports (`src/application/ports`)

```ts
interface Clock {
  now(): Instant;
}

interface EventStore {
  events(): readonly LoggedEvent[];
  raw(id: string): RawMessage | undefined;
  append(batch: { raws?: RawMessage[]; events: LoggedEvent[] }): void; // idempotent on event key / id
  subscribe(listener: () => void): Unsubscribe; // fires for local and cross-tab appends
  reset(): void;
}

interface OperatorAdapter {
  operatorId: OperatorId;
  parse(raw: RawMessage): ParsedItem[]; // never throws; a malformed payload yields [] and a quarantine reason
}
// ParsedItem = { ref: OperatorRefValue | { vessel, voyage }, fact, occurredAt, precision, rule }
//            | { ref, freeText: string }      // hand over to the TextInterpreter

// --- the five AI ports: each has a deterministic mock adapter in the prototype ---
interface TextInterpreter {
  // free-text operator messages -> a reading to confirm
  read(input: {
    operatorId: OperatorId;
    text: string;
  }): Promise<{ fact: Fact; rule: string } | null>;
}
interface EtaEstimator {
  // the model behind every Estela estimate
  estimate(input: EstimatorInput): Promise<Estimate | Withheld>;
}
interface DigestWriter {
  // one sentence over computed facts
  highlight(facts: DigestFacts): Promise<string | null>;
}
interface MessageDrafter {
  // customer notices and messages to operators: facts in, words out
  draft(request: DraftRequest): Promise<Draft>;
}
interface QueryInterpreter {
  // natural language -> a filter, a lookup, or an honest refusal
  interpret(text: string, context: InterpreterContext): Promise<Interpretation>;
}
```

Three rules for the AI ports:

1. **Outputs are typed data, never control flow.** A `ShipmentFilter` runs through the deterministic
   filter inside the actor's scope; a model cannot widen the perimeter or invent a row.
2. **Facts in, words out.** Counts, dates and statuses are computed by rules and passed as fields;
   the customer-facing date is rendered by code from a snapshot, never parsed back from prose.
3. **Fail closed.** `null`, `Withheld` or an error falls back to "No estimate", a plain text match, or
   a fixed template. A failed AI call never blocks the manual path.

`InterpreterContext` carries only the vocabulary of the actor's perimeter (account names, site
aliases, operator names, vessel names, countries) and `now`. `Interpretation` is one of
`{ kind: 'filter'; filter: ShipmentFilter; notUsed: string[] }`,
`{ kind: 'lookup'; reference: string }`,
`{ kind: 'unsupported'; reference?: string; topic: string }`,
`{ kind: 'not_understood' }`.

## 2. The gateway (`src/application/estela.ts`): the only thing the UI calls

```ts
interface Estela {
  now(): Instant;
  actors(): Actor[]; // the five demo personas

  ops: {
    overview(actor: InternalActor): Promise<OpsOverview>; // digest: computed counts + AI highlight; perimeter summary
    shipments(
      actor: InternalActor,
      query: { view: "attention" | "waiting" | "all"; filter?: ShipmentFilter },
    ): Promise<OpsRow[]>;
    shipment(actor: InternalActor, id: ShipmentId): Promise<OpsShipmentView | null>;
    ask(actor: InternalActor, text: string): Promise<AskResult>;
    draft(actor: InternalActor, shipmentId: ShipmentId, step: StepKind): Promise<Draft | null>;
    execute(actor: InternalActor, command: OpsCommand): Promise<CommandResult>;
  };
  portal: {
    home(actor: ExternalActor): Promise<PortalHome>;
    shipment(actor: ExternalActor, id: ShipmentId): Promise<PortalShipmentView | null>;
  };

  subscribe(listener: (change: Change) => void): Unsubscribe;
  demo: { events(): DemoEventStatus[]; send(id: DemoEventId): Promise<void>; reset(): void };
}
```

- Every query and command applies the perimeter policy first. Out of perimeter and unknown id both
  return `null` / `{ ok: false, reason: 'not_found' }`.
- `OpsCommand`: `confirm_reading { shipmentId, eventKey, accepted }`,
  `send_notice { shipmentId, exception, subject, body }`,
  `contact_operator { shipmentId, exception, operatorId, subject, body }`,
  `send_document { shipmentId, exception, docType, fileName, subject, body }`.
  `execute` checks scope and role capability (`forbidden` with the reason string the UI shows),
  appends internal events to the same log the feed writes to, and returns.
  `send_notice` stores a `PublishedSnapshot` (the door date it communicates, with its provenance),
  taken by code from the current dates, not from the body text.
- `ask`: interprets, then answers deterministically:
  `{ kind: 'filter', filter, notUsed, rows }` (rows already scoped), or
  `{ kind: 'answer', shipmentId, statusLine }` for a lookup that resolves inside the perimeter, or
  `{ kind: 'unsupported', message, shipmentId? }`, or `{ kind: 'not_found', reference }` ("No order
  12345 in your shipments", identical whether or not it exists elsewhere), or
  `{ kind: 'not_understood', text, rows }` (plain text match).
  The status line is composed by code from the three dates and the stage; it is not model output.
- `Change`: `{ shipmentIds: ShipmentId[]; notice?: FeedNotice }`. A `FeedNotice` is built when an
  operator event is ingested: `{ operatorName, headline, affected: number, needNotice: number,
filter?: ShipmentFilter }`. Subscribers refetch; operations show the notice as a toast when at least
  one affected shipment is in their perimeter. Carry hints, not data: scope is enforced again on the
  refetch.
- View types (`src/application/views.ts`) hold everything a screen needs in one read, with instants as
  numbers and places with their zone, and with the one-line texts already composed ("why it is
  here", clock label, step labels). Text composition is deterministic code in the application layer
  (never in components) and uses the shared date formatter from the domain time module.
  - `OpsRow`: id, orderRef, account (name, type), origin site name, destination, route strip model,
    stage (+ import gate state), health, primary exception summary (type, why, clock, next step,
    state, needsConfirmation), dates (committed, operator, estela), last update (age source).
  - `OpsShipmentView`: header fields, incoterm line, references, the three dates plus
    "customer currently sees" (verdict + published date), exceptions with evidence lines and steps
    (with `allowed: boolean` and `disabledReason` for the actor), the timeline (sections and entries,
    each source carrying its raw message), documents with status, sent messages.
  - `PortalHome`: summary sentence parts (computed), notices, rows grouped as "needs your attention"
    (delayed or on hold), "on the way", "delivered in the last 30 days".
  - `PortalShipmentView`: the narrow customer projection of the domain spec §8.
- Estimates are computed once per shipment per log version and cached; opening a screen never waits
  on a model. The latency of user-triggered AI calls (`ask`, `draft`, digest highlight) is injected
  at composition: 600 ms in the app, 0 in tests.

## 3. Ingestion use case

`ingest(raw: RawMessage)`:

1. Pick the operator adapter; `parse` (Zod schema, then the mapping table). Free text goes to
   `TextInterpreter.read`; its result is appended with `reading.method = 'ai'` (pending review).
2. Correlate: reference → shipment (and vessel + voyage → every shipment aboard). Unknown references
   go to the orphan list.
3. Build `OperatorEvent`s with idempotency keys; append with the raw message.
4. Recompute affected projections; build the `FeedNotice` (compare the attention set before and
   after); notify subscribers.

The seed goes through the **same** `ingest`: fixtures author canonical events, each operator's small
_emitter_ renders them to that operator's raw format, and the app really parses raw text at start-up.
Adapter tests use hand-written payloads, not the emitters.

## 4. Mock AI adapters (`src/adapters/ai-mock`), deterministic, computed not canned

- **`ruleBasedEstimator`** (stands in for a learned model; in the UI its basis reads "Rule-based
  estimate"). Rules, in order:
  1. Delivered → nothing. Stale → `Withheld` with the reason ("no position from Eisvogel Spedition
     for 27 h").
  2. Walk the remaining planned milestones in plan order, starting from the last confirmed one.
     **Propagate**: `t = previous t + (the plan's own gap between the two milestones)`, then
     `t = max(t, the operator's estimate for this milestone if it has one)`. Never in the past: an
     overdue, unconfirmed milestone is floored at `now`.
  3. **Schedule anchors.** `LOADED`, `VESSEL_DEPARTED` and `VESSEL_ARRIVED` follow the vessel, not our
     box: `t = operator estimate ?? planned` (floored at `now`), not propagated.
  4. **Working days.** Office and road milestones (`PICKED_UP`, `OUT_FOR_DELIVERY`, `DELIVERED`,
     `EXPORT_RELEASED`, `IMPORT_LODGED`, `IMPORT_RELEASED`) that land on a Saturday or Sunday in their
     place's zone move to Monday, same local time. Delay is quantised, not linear.
  5. **Missed departure.** A milestone with a `next_departure` deadline that is more than 6 h overdue
     restarts the chain at that departure.
  6. **Open hold.** Customs: the release is assumed on the next working day (noon local), with the
     assumption "if the corrected invoice reaches the broker today". Carrier: the chain restarts at
     the `next_departure` deadline, with the assumption "if the carrier releases the goods for that
     round".
  7. Output: the door instant; a window (`earliest` = the door day; `latest` = the next working day
     when an import release is still ahead, else the same day); the chain as steps (label, time,
     where the time came from: operator estimate, vessel schedule, lane plan, next departure,
     assumption); `firmsUpWhen` (the first remaining milestone, in words); `assumption` if any.
     Expected results are in the world spec (§6, §7): EST-4058 after event A → Fri 16 Oct (window to
     Mon 19 Oct); EST-4134 → Fri 9 Oct; EST-4012 → Fri 9 Oct (window to Mon 12 Oct), conditional;
     EST-4127 → withheld; every on-time shipment → the same day as its operator estimate or plan.
- **`patternTextInterpreter`**: keyword and regex rules over Spanish free text (`retenid`,
  `reconocimiento`, `discrepancia de peso`, numbers with units). Returns the hold reading for the
  seeded email; `null` for text it cannot read (then the event is a `note`).
- **`templateDigestWriter`**: one sentence built from the two nearest deadline-bound cases.
- **`templateMessageDrafter`**: a template per (audience, exception type, cause), slots filled from
  the request's fact sheet. Customer drafts respect the incoterm rule and carry no fault wording.
  Returns `{ subject, body, factsUsed: string[] }`.
- **`grammarQueryInterpreter`**: dictionaries (countries and demonyms, site aliases, account names,
  operator names, vessel names, health and stage words such as "late", "running late", "at risk",
  "held", "stuck in customs", "open", "delivered"), period words ("today", "this week", "next
  week"), a reference pattern (order number or `EST-` id, with or without a question), a small list
  of unsupported topics (duty, price, cost, invoice amount). Unrecognised content words are returned
  in `notUsed`; if nothing at all is recognised the result is `not_understood`.

Every mock is a pure function of its input (and the injected clock): no `Math.random()`.

## 5. Memory adapters (`src/adapters/memory`)

- `InMemoryEventStore` (tests, server prerender) and `BrowserEventStore`.
- **`BrowserEventStore` persists and broadcasts.** The seed is rebuilt deterministically at start-up
  and is not persisted. Everything appended afterwards (demo events, commands) is written to
  `localStorage` under one versioned key, together with the session's real start time. A `storage`
  event from another tab reloads the appended list and notifies subscribers, so operations and the
  portal can sit side by side in two windows and a reload does not lose the demo. A session older
  than six hours, or a version mismatch, resets itself. `reset()` clears the key and starts a new
  session in every tab.
- `DemoClock`: `now = T0 + (Date.now() - sessionStartedAt)`; `FixedClock`; `ManualClock.advance(ms)`.
- `ScriptedDemoFeed`: the four demo events of the world spec with their preconditions (evaluated
  against the log). "Sent" is derived from the log, so every tab agrees.

## 6. Composition (`src/composition`)

- `createEstela(deps)`: wires ports to adapters; ingests the seed; returns the gateway. Async (the
  text interpreter is awaited).
- `createBrowserEstela()`: `DemoClock`, `BrowserEventStore`, mock AI with 600 ms latency. Created once
  per page load, in the browser only.
- `createTestEstela({ at?: Instant })`: `FixedClock` (default T0), in-memory store, zero latency.
  Integration tests drive the whole core through this, without React.

## 7. What "taking it to production" replaces

This mapping belongs to the write-up; in code it is commented only where it helps. Each mock
adapter is replaced behind the same port: the estimator by a per-lane learned model with the rule
set as fallback; the text interpreter and the query interpreter by a small language model
constrained to the closed fact / filter schema; the drafter by a larger language model whose only
context is the fact sheet; the event store by PostgreSQL (raw events, canonical events, projections);
the demo feed by per-operator connectors; `subscribe` by server-sent events filtered by scope.
