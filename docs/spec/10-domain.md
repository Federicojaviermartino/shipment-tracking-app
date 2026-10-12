# Estela — specification, part 1: the domain

Everything here is plain TypeScript in `src/domain` (pure functions over plain data) unless stated
otherwise. Type sketches show intent: names and shapes were free to change during implementation as
long as the rules and the invariants held. Where a rule turned out to be wrong, the code follows what
is domain-correct and the difference is listed in the [index](README.md).

## 1. Glossary (one vocabulary, used in code, UI and docs)

- **Shipment**: one consignment from an origin site to a consignee under one customer order and one
  committed date. One container (FCL) or a set of pallets; one-to-one, stated as a simplification.
- **Section**: a stretch of the journey used to group the timeline and draw the route: `road`
  (one haulier, from → to), `port` (a node; may carry a customs gate: `export` or `import`), `sea`
  (one vessel + voyage, from → to).
- **Milestone**: a point-in-time fact in the shipment's plan, done only when an operator confirms it.
- **Signal**: operator news that is not a milestone: a position, an estimate for a milestone, a hold
  being raised or cleared, a remark we could not map.
- **Operator**: a company that reports on a shipment. Typed: `road_carrier`, `ocean_carrier`,
  `forwarder`. Our own systems and people are the source `IBON`.
- **Committed date**: the delivery day promised to the consignee, a local date at the destination.
- **Confirmed**: an operator reported that it happened.
- **Operator estimate**: an operator declared when it will happen (the line declares port ETAs; the
  forwarder or the haulier declares the door date).
- **Estela estimate**: computed by Estela's estimator (the model). Always a day with a window and the
  chain of steps behind it; or withheld, with the reason.
- **Planned**: taken from the booking plan; nobody has asserted it.
- **Published date**: the delivery date the customer currently sees (derived, see §8).
- **Hold**: an operator-raised blocking condition (`customs` or `carrier`), open until cleared.
- **Stage**: where the cargo physically is. **Health**: whether it will meet the committed date.
- **Exception**: a derived condition that needs a person. **Step**: a proposed action on it.
- **Perimeter**: the shipments an actor may see. **Actor**: the signed-in persona.

UI labels for provenance: operations see `Confirmed`, `Operator estimate`, `Estela estimate`,
`Planned`, `Committed`. Customers see `Confirmed`, `Estimated`, `Planned`.

## 2. Time

```ts
type Instant = number; // epoch ms, UTC
type LocalDate = string; // 'YYYY-MM-DD' in a named zone
type Zone = "Europe/Madrid" | "Europe/Paris" | "Europe/Berlin" | "America/Mexico_City";
type Place = { name: string; country: "ES" | "FR" | "DE" | "MX"; zone: Zone; locode?: string };
```

- Every event is displayed in the **local time of its place**; lateness is counted in **local days at
  the destination** (`committedDate` versus the local date of an instant in the destination zone).
- Provide a small, tested time module (built on `Intl.DateTimeFormat` with `timeZone`; no date
  library): `localDate(instant, zone)`, `instantAt(localDate, 'HH:mm', zone)`, `diffDays(a, b)`,
  `isWorkingDay(localDate)` (Mon–Fri; no holiday calendar, stated as a limitation),
  `nextWorkingDay`, `addWorkingDays`, `weekOf(localDate)` (Mon–Sun). Europe leaves DST on
  25 Oct 2026; Mexico has none: test arithmetic across that date.
- Precision is part of a timestamp: `'minute'` or `'day'` (a broker's status report gives days only).
  Day-precision values never render a time of day.

## 3. Shipment and plan (static booking data)

```ts
type MilestoneCode =
  | "BOOKED"
  | "PICKED_UP"
  | "HUB_IN"
  | "HUB_OUT"
  | "OUT_FOR_DELIVERY"
  | "GATE_IN"
  | "EXPORT_RELEASED"
  | "LOADED"
  | "VESSEL_DEPARTED"
  | "VESSEL_ARRIVED"
  | "DISCHARGED"
  | "IMPORT_LODGED"
  | "IMPORT_RELEASED"
  | "GATE_OUT"
  | "DELIVERED";

type Shipment = {
  id: ShipmentId; // 'EST-4058'
  orderRef: string; // the customer's order number, e.g. '12345'
  accountId: AccountId;
  originSiteId: SiteId;
  consignee: { name: string; place: Place };
  incoterm: { code: "DAP" | "CPT"; place: string };
  cargo: {
    description: string;
    packages: string;
    grossWeightKg: number;
    container?: { size: "20'" | "40'HC"; number: string };
  };
  committedDate: LocalDate; // at consignee.place.zone
  sections: Section[]; // ordered
  plan: PlannedMilestone[]; // ordered; this order IS timeline order
  refs: OperatorRef[]; // expedition no., booking, container, B/L, forwarder file
  voyage?: { vessel: string; voyage: string };
  deadlines: Deadline[]; // clocks that run a desk, see §6
};
type Section =
  | {
      id: string;
      kind: "road";
      operatorId: OperatorId;
      from: Place;
      to: Place;
      telematics: boolean;
    }
  | { id: string; kind: "port"; place: Place; gate?: "export" | "import" }
  | { id: string; kind: "sea"; operatorId: OperatorId; from: Place; to: Place };
type PlannedMilestone = {
  key: string; // `${code}@${place key}`; unique within the shipment
  code: MilestoneCode;
  sectionId: string;
  place: Place;
  plannedAt: Instant;
  reporters: Source[]; // who may assert it, in authority order (first wins the time)
};
type Deadline = {
  kind: "export_cutoff" | "free_time_end" | "next_departure";
  at: Instant;
  label: string; // e.g. 'Export clearance cut-off for NORAY DENEB 614W'
  milestoneKey?: string; // the milestone the clock protects or re-starts
};
```

Milestone meaning and who reports it reliably:

| Code                                 | Meaning                                                           | Typical reporter          |
| ------------------------------------ | ----------------------------------------------------------------- | ------------------------- |
| `BOOKED`                             | transport order confirmed                                         | `IBON` (our ERP)          |
| `PICKED_UP`                          | loaded and departed from the origin site                          | haulier                   |
| `HUB_IN` / `HUB_OUT`                 | scan into / out of a depot or transit hub (place matters)         | groupage network          |
| `OUT_FOR_DELIVERY`                   | on the delivery round                                             | haulier                   |
| `GATE_IN`                            | full container into the origin terminal                           | line (authority), haulier |
| `EXPORT_RELEASED`                    | export customs released (a gate, not a place)                     | forwarder                 |
| `LOADED`                             | loaded on board                                                   | line                      |
| `VESSEL_DEPARTED` / `VESSEL_ARRIVED` | vessel event at a port (vessel-level, shared by every box aboard) | line                      |
| `DISCHARGED`                         | container discharged at destination                               | line                      |
| `IMPORT_LODGED` / `IMPORT_RELEASED`  | import entry lodged / released (a gate)                           | forwarder                 |
| `GATE_OUT`                           | full container out of the destination terminal                    | line                      |
| `DELIVERED`                          | delivered to the consignee                                        | haulier / forwarder       |

Customs is a **gate at a port node**, not a stage: it never moves the stage (a pre-lodged entry must
not put a vessel at sea "at customs").

Lane templates (the fixtures build `sections` and `plan` from these):

- **Road, full load**: one `road` section. `PICKED_UP`, `DELIVERED`. Domestic distribution adds
  `HUB_IN` (destination platform) and `OUT_FOR_DELIVERY`.
- **Road, groupage**: one `road` section. `PICKED_UP`, `HUB_IN`/`HUB_OUT` at the origin depot,
  `HUB_IN`/`HUB_OUT` at the transit hub, `OUT_FOR_DELIVERY`, `DELIVERED`.
- **Ocean FCL, door to door**: `road` (site → origin port): `PICKED_UP`. `port` origin (gate
  `export`): `GATE_IN`, `EXPORT_RELEASED`, `LOADED`. `sea`: `VESSEL_DEPARTED`, `VESSEL_ARRIVED`.
  `port` destination (gate `import`): `DISCHARGED`, `IMPORT_LODGED`, `IMPORT_RELEASED`, `GATE_OUT`.
  `road` (port → consignee): `DELIVERED`.

`BOOKED` is the first planned milestone of every shipment (rendered above the first section).

## 4. The log

The single source of truth is an append-only log. Raw operator messages are kept verbatim next to
their canonical translation.

```ts
type RawMessage = {
  id: string;
  operatorId: OperatorId;
  channel: "csv" | "webhook" | "api" | "report" | "email";
  receivedAt: Instant;
  body: string;
}; // verbatim, shown under "Show original"

type Fact =
  | { type: "milestone"; code: MilestoneCode; place: Place }
  | {
      type: "estimate";
      code: MilestoneCode;
      place: Place;
      at: Instant;
      precision: "minute" | "day";
      remark?: string;
    }
  | { type: "estimate_withdrawn"; code: MilestoneCode; remark?: string }
  | { type: "hold"; hold: "customs" | "carrier"; state: "raised" | "cleared"; reason: string }
  | { type: "position"; place: string }
  | { type: "note"; text: string }; // not mapped: shown verbatim to operations only

type OperatorEvent = {
  kind: "operator";
  key: string; // idempotency: operator + reference + fact signature + occurredAt
  shipmentId: ShipmentId;
  source: Source;
  rawId: string;
  fact: Fact;
  occurredAt: Instant;
  precision: "minute" | "day";
  receivedAt: Instant;
  reading: { method: "table"; rule: string } | { method: "ai"; rule: string };
};
type InternalEvent = {
  kind: "internal";
  id: string;
  shipmentId: ShipmentId;
  at: Instant;
  by: UserId;
} & (
  | { type: "reading_reviewed"; eventKey: string; accepted: boolean }
  | {
      type: "notice_sent";
      exception: ExceptionType;
      subject: string;
      body: string;
      published: PublishedSnapshot | null;
    }
  | {
      type: "operator_contacted";
      exception: ExceptionType;
      operatorId: OperatorId;
      subject: string;
      body: string;
    }
  | {
      type: "document_sent";
      exception: ExceptionType;
      docType: DocumentType;
      fileName: string;
      to: OperatorId;
      body: string;
    }
);
type DocumentEvent = {
  kind: "document";
  shipmentId: ShipmentId;
  at: Instant;
  source: Source;
  docType: DocumentType;
  fileName: string;
  customerVisible: boolean;
};
type LoggedEvent = OperatorEvent | InternalEvent | DocumentEvent;
```

Rules of the fold (each one is a unit test):

- **Order-independent and idempotent.** The projection folds a _set_: any arrival order, with or
  without redelivered duplicates, yields the same timeline. Appending is idempotent on `key`.
- **Correction.** The same milestone from the same source with a different time: the latest
  `receivedAt` wins.
- **Merge.** One physical event reported by two sources (the haulier's "entered terminal" and the
  line's gate-in) is one milestone with two sources. The time shown is the first reporter's in
  `reporters` order that confirmed it; the entry says "2 sources".
- **Authority.** A source may confirm a planned milestone only if it is in that milestone's
  `reporters`. Otherwise the event is kept as a `note`.
- **No back-fill.** A planned milestone that sits before the furthest confirmed one and was never
  reported is `not_reported`. It is never given a time.
- **Unplanned milestones** (an extra hub scan after a breakdown) are inserted in their section in
  time order and flagged `unplanned`.
- **AI readings are gated.** An event with `reading.method === 'ai'` counts as a fact only after a
  `reading_reviewed { accepted: true }` for its key. While pending, operations see it (marked "Read
  by AI, confirm") and the exception it implies is raised for operations; customers do not see it.
  Rejected readings are ignored by every rule and shown to operations as a verbatim note.
- **Vessel-level events** arrive without a shipment reference; correlation fans them out to every
  shipment whose `voyage` matches, one `OperatorEvent` per shipment sharing the `rawId`.
- **Unmatched references** never attach by guess: they are dropped from projections (kept in an
  orphan list in the store; no UI for it).

## 5. Projections

### 5.1 Timeline

`buildTimeline(shipment, events, now)` returns sections with entries, in plan order:

```ts
type Confirmed = { kind: "confirmed"; source: Source; rawId: string; receivedAt: Instant };
type Declared = { kind: "declared"; source: Source; rawId: string; receivedAt: Instant };
type Estimated = { kind: "estimated"; basis: string; computedAt: Instant }; // Estela's model
type Stamp<P> = { at: Instant; precision: "minute" | "day"; provenance: P };

type TimelineEntry =
  | {
      type: "milestone";
      key: string;
      code: MilestoneCode;
      place: Place;
      state: "done" | "next" | "upcoming" | "not_reported";
      unplanned?: true;
      actual?: Stamp<Confirmed>; // the ONLY slot a fact can occupy
      operatorEstimate?: Stamp<Declared>;
      plannedAt?: Instant;
      sources: { source: Source; rawId: string; at: Instant }[];
      reading?: "table" | "ai_pending" | "ai_accepted";
    }
  | {
      type: "hold";
      hold: "customs" | "carrier";
      open: boolean;
      reason: string;
      raised: Stamp<Declared>;
      clearedAt?: Instant;
      reading: "table" | "ai_pending" | "ai_accepted";
    }
  | {
      type: "position";
      lastPlace: string;
      at: Instant;
      count: number;
      source: Source;
      rawId: string;
    }
  | { type: "note"; text: string; at: Instant; source: Source; rawId: string }
  | { type: "action"; label: string; by: UserId; at: Instant }; // our own actions, from internal events
```

A model estimate can never be assigned to `actual`: the compiler rejects it. Rendering switches
exhaustively on `provenance.kind`, so a new kind fails the build until it has a label.

### 5.2 Stage (facts only)

`stageOf(timeline)`: the furthest **confirmed physical** milestone in plan order decides.

| Furthest confirmed               | Stage                 | Ops label           | Customer label           |
| -------------------------------- | --------------------- | ------------------- | ------------------------ |
| none or `BOOKED`                 | `booked`              | Booked              | Being prepared           |
| `PICKED_UP`, `HUB_IN`, `HUB_OUT` | `in_transit`          | In transit          | On the way               |
| `GATE_IN`, `LOADED`              | `at_origin_port`      | At origin port      | At the port of departure |
| `VESSEL_DEPARTED`                | `at_sea`              | At sea              | At sea                   |
| `VESSEL_ARRIVED`, `DISCHARGED`   | `at_destination_port` | At destination port | At the port of arrival   |
| `GATE_OUT`                       | `final_leg`           | On final leg        | On the way to you        |
| `OUT_FOR_DELIVERY`               | `out_for_delivery`    | Out for delivery    | Out for delivery         |
| `DELIVERED`                      | `delivered`           | Delivered           | Delivered                |

`EXPORT_RELEASED`, `IMPORT_LODGED` and `IMPORT_RELEASED` never change the stage. The import gate has
its own derived state shown next to the stage when the cargo is at the destination port:
`not_lodged | lodged | held | released`. A late old event can fill a gap; it cannot move the stage
backwards.

### 5.3 The three dates (plus the published one)

`selectDates(shipment, timeline, estimate)` returns:

- `committed`: the committed local date.
- `operator`: the latest operator-declared estimate for `DELIVERED` that has not been withdrawn, with
  who declared it and when (`receivedAt`), plus `superseded: boolean`.
  **Superseded** means: an upstream fact (a confirmed milestone or an operator estimate earlier in the
  plan) was received _after_ this door estimate, and the estimator's door day, computed from current
  upstream knowledge, is later than it. A superseded estimate is still shown, with its age and the
  words "declared before <the upstream change>"; it is never silently preferred.
- `estela`: the estimator's output: `{ at, window: { earliest, latest }, steps, assumption?, firmsUpWhen?, basis }`
  or `{ withheld: true, reason }`. `agreesWithOperator` is true when its local day equals the
  operator's.
- `delivered`: the confirmed delivery stamp, when it exists.
- `published`: see §8.

Lateness is always computed in local days at the destination against `committed`.

### 5.4 Staleness: "an expected update is overdue"

Hours of silence are meaningless at sea (a line reports nothing between departure and arrival), so
staleness is defined per expectation, as data:

- **Telematics silence.** In a `road` section with `telematics: true`, between `PICKED_UP` and
  `DELIVERED`, no signal for more than 14 h (covers the 11 h daily rest plus margin).
- **Overdue milestone.** The next physical milestone's expected time (operator estimate if any, else
  planned) plus a grace has passed with no report: `PICKED_UP` 4 h; `VESSEL_ARRIVED` 24 h;
  `DELIVERED` until 10:00 local on the next day. Other milestones have no grace rule.

`expectedUpdateBy(shipment, timeline)` returns the instant after which the shipment is stale, or
`null`. Stale is its own health state: unknown is not late.

### 5.5 Exceptions and health

`detectExceptions(shipment, timeline, dates, events, now)` is recomputed on every read; an exception
exists exactly while its rule fires. Delivered shipments have none.

| Type              | Fires when                                                                                                                                                  | Health  | Basis                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `customs_hold`    | an open hold of kind `customs` (AI readings: pending or accepted, not rejected)                                                                             | Held    | declared                                                                                             |
| `carrier_hold`    | an open hold of kind `carrier`                                                                                                                              | Held    | declared                                                                                             |
| `delay`           | not delivered and (the committed day has passed, or the operator's door estimate is a later local day than committed)                                       | Delayed | declared                                                                                             |
| `predicted_delay` | no `delay`, and the Estela estimate is a later local day than committed                                                                                     | At risk | `declared` if the estimate moved because of an operator-declared upstream fact; `inferred` otherwise |
| `cutoff_risk`     | an `export_cutoff` deadline lies within the next 48 h and its prerequisite is unmet (a required document is missing and `EXPORT_RELEASED` is not confirmed) | At risk | rule                                                                                                 |
| `stale`           | `now > expectedUpdateBy`                                                                                                                                    | Stale   | rule                                                                                                 |

```ts
type ShipmentException = {
  id: string; // `${shipmentId}:${type}`, stable across re-detection
  type: ExceptionType;
  health: "held" | "delayed" | "at_risk" | "stale";
  basis: "declared" | "inferred" | "rule";
  since: Instant;
  actBy?: { at: Instant; label: string }; // the clock: see §6
  evidence: EvidenceLine[]; // "why it is here": text + provenance + the event keys behind it
  needsConfirmation?: true; // rests on an AI reading that nobody has confirmed yet
  steps: Step[]; // §7
  state: "needs_action" | "waiting"; // §7
};
```

Shipment health is the worst open exception: `held > delayed > at_risk > stale > on_time`
(`delivered` when delivered). A shipment has one row in the queue; its primary exception is the worst
one, the others are listed under it.

## 6. Clocks and ranking

A desk ranks by **the deadline with a promise or money attached**, not by type. Every exception gets
`actBy` from data:

- `delay` whose customer has not been told: `actBy = now`, label "Customer not yet told".
- `predicted_delay` with basis `declared` and no notice yet: `actBy = now`, same label.
- `predicted_delay` with basis `inferred`, `carrier_hold`: the shipment's `next_departure` deadline
  ("Next linehaul leaves Perpignan 20:00", "Tomorrow's first delivery round leaves 07:00").
- `cutoff_risk`: the `export_cutoff` deadline.
- `customs_hold`: the `free_time_end` deadline ("Free time ends Fri 9 Oct: demurrage starts").
- `stale`: none.

Queue order: `needs_action` cases by ascending `actBy` (none last), ties by health rank, then by
committed date. The row prints the clock ("Act within 4 h", "Cut-off in 20 h", "Now"), so the order
explains itself.

## 7. The playbook: proposed steps

Rules choose the exception and the steps; AI only estimates and writes. Steps are ordered.

| Exception                   | Steps                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customs_hold`              | (if the hold is an unconfirmed AI reading) `confirm_reading` → `send_document` (corrected commercial invoice, to the forwarder acting as broker) → `notify_customer` |
| `carrier_hold`              | `contact_operator` (release what can move, photos) → `notify_customer`                                                                                               |
| `delay`                     | `notify_customer`                                                                                                                                                    |
| `predicted_delay`, declared | `notify_customer`                                                                                                                                                    |
| `predicted_delay`, inferred | `contact_operator` (confirm before alarming the customer) → `notify_customer`                                                                                        |
| `cutoff_risk`               | `send_document` (the missing document, to the forwarder)                                                                                                             |
| `stale`                     | `contact_operator` (position and ETA)                                                                                                                                |

```ts
type Step = {
  kind: "confirm_reading" | "send_document" | "contact_operator" | "notify_customer";
  label: string; // 'Send the corrected invoice to Turia Global Forwarding'
  state: "todo" | "done" | "outdated";
  requires: "logistics" | "any_internal"; // role capability
  doneBy?: UserId;
  doneAt?: Instant;
  // payload hints for the drawer: operatorId, docType, eventKey ...
};
```

Done-ness is **derived from the log**, never stored on a ticket:

- `confirm_reading`: a `reading_reviewed` exists for the event.
- `send_document`: a `document_sent` of that type exists after `exception.since`.
- `contact_operator`: an `operator_contacted` exists after `exception.since`.
- `notify_customer`: **the customer has been told the current best door day.** The best door day is
  the operator's estimate if it exists and is not superseded, else the Estela estimate, else none.
  The step is `done` when a `notice_sent` exists whose snapshot carries that same local day (or, when
  there is no best day at all, when any notice was sent after `exception.since`). It is `outdated`
  when notices exist but the latest one carries a different day: the customer has been told a date
  that is no longer the best one. This needs no history: when an Estela estimate that was already
  communicated is later confirmed by the operator on the same day, the step stays done and no second
  notice is proposed.

Case state: `needs_action` while any step is `todo` or `outdated`; `waiting` when every step is done
and the rule still fires ("Your part is done. Waiting on customs."). When the rule stops firing the
exception is gone ("Resolved by operator update" is shown as a toast and as a timeline action entry,
not kept as a ticket).

Role capability (the one place where _role_ differs from _perimeter_): `send_document`,
`contact_operator` and `confirm_reading` require the `logistics` role; `notify_customer` is open to
`logistics` and `customer_support`. A step the actor cannot perform is shown disabled with its reason
("Needs the Logistics role. Ask Marta Soler.").

Incoterm awareness: under DAP the consignee is the importer of record and its broker clears. Estela
therefore never proposes "clear customs"; it proposes sending the exporter's document to the broker,
and customer copy never says "you do not need to do anything" on an import matter.

## 8. What the customer sees

Rule: **facts flow, predictions wait.** `toCustomerView(...)` returns a narrower type (data
minimisation is a type, not a hidden element).

**Published date** (`published`):

1. Delivered → the confirmed delivery (`Confirmed`).
2. Else take the operator's door estimate if it exists and is not superseded, and the latest
   `notice_sent` snapshot if any; the **more recently issued** of the two wins
   (`Estimated`, with "by the carrier" or "by Ibón logistics, approved by <name>").
3. Else → `under_review` (carrying the superseded or withdrawn previous date, if any, as "was …").

**Verdict:**

| Condition (first match)                                           | Verdict       | Copy                                            |
| ----------------------------------------------------------------- | ------------- | ----------------------------------------------- |
| delivered                                                         | `delivered`   | Delivered                                       |
| an open hold that is a fact (table-mapped or an accepted reading) | `on_hold`     | Held at customs / On hold with the carrier      |
| published date is a later local day than committed                | `delayed`     | Delayed                                         |
| health is `on_time`                                               | `on_time`     | On time                                         |
| otherwise                                                         | `in_progress` | no claim: "Date under review" or just the stage |

So the customer never reads "On time" while any internal exception is open (no green lie), never sees
a model estimate that nobody approved, and still sees every operator fact as soon as it lands.

**Included:** stage label; verdict; published date with its provenance word; a one-line reason (from
the latest approved notice, or fixed wording for facts); customer-level milestones (`PICKED_UP`,
`GATE_IN`, `VESSEL_DEPARTED`, `VESSEL_ARRIVED`, `IMPORT_LODGED`, `IMPORT_RELEASED`, `GATE_OUT`,
`OUT_FOR_DELIVERY`, `DELIVERED`, each with confirmed time, operator estimate or planned date);
confirmed holds in fixed wording; the identifiers an importer needs (their order number, container,
bill of lading, vessel and voyage, port ETA, incoterm line such as "DAP Querétaro: you clear
import"); customer-visible documents; approved notices with the approver's name; the time of the last
confirmed update.

**Never included:** raw payloads and operators' free text, notes, hub scans and positions (only the
age of the last update), pending or rejected AI readings, Estela estimates outside an approved notice,
exceptions, steps, clocks, internal actions, internal documents, other accounts' cargo (including
whatever shares the vessel).

## 9. Perimeter

```ts
type Actor =
  | {
      kind: "internal";
      userId: UserId;
      name: string;
      title: string;
      role: "logistics" | "customer_support";
      siteIds: SiteId[] | "all";
      accountIds: AccountId[] | "all";
    }
  | { kind: "external"; userId: UserId; name: string; title: string; accountId: AccountId };
```

- `inScope(actor, shipment)`: internal → site in `siteIds` **and** account in `accountIds`; external →
  `shipment.accountId === actor.accountId`. A subsidiary is an account like any other.
- The policy runs **inside the gateway on every query and command**. Out of perimeter is
  indistinguishable from a wrong id ("We couldn't find that shipment."), so existence never leaks.
- Search, digest counts and filter options are computed from in-perimeter shipments only; whatever
  the query interpreter returns, results are filtered by scope after it.

## 10. Filters (the target of natural-language search)

```ts
type ShipmentFilter = {
  destinationCountry?: Place["country"];
  originSiteId?: SiteId;
  accountId?: AccountId;
  operatorId?: OperatorId;
  vessel?: string;
  health?: Health[];
  stage?: Stage[];
  customsHold?: true;
  due?: "today" | "this_week" | "next_week"; // on the committed date; week = Mon–Sun, resolved from now
  delivered?: boolean;
  text?: string; // plain reference / keyword match
};
```

`applyFilter(rows, filter, now)` is deterministic and pure. The same structure backs the manual
filters, the chips and the URL, so the model can only ever produce a filter, never a result.

## 11. Documents

`DocumentType`: `commercial_invoice`, `packing_list`, `export_declaration`, `bill_of_lading`, `cmr`,
`delivery_note`, `proof_of_delivery`. Documents enter through the log (`DocumentEvent`, or
`document_sent` for what we send out). Derived status per required document: `on_file`, `missing`,
`not_yet_due` (a bill of lading cannot exist before loading; showing it as missing would be a false
alarm), `pending` (proof of delivery after delivery: normal for days), `sent` (sent to the broker,
awaiting their acknowledgement).

Requirements (data, by lane): ocean → commercial invoice and packing list before `EXPORT_RELEASED`,
export declaration at `EXPORT_RELEASED`, bill of lading after `LOADED`, proof of delivery after
`DELIVERED`. Road → CMR (international) or delivery note (domestic) at pickup, proof of delivery
after delivery. Only a missing document that blocks a cut-off raises an exception (`cutoff_risk`).
