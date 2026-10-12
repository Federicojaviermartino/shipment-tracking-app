# Estela — specification, part 5: testing

Tests are spent where a wrong answer would mislead a user. Layout, styling and the exact wording of
mock AI prose are deliberately untested. Test names read as behaviour ("marks a skipped milestone as
not reported and never back-fills it"). No snapshot tests. Everything below the UI runs on a fixed
clock.

Vitest has two projects: `core` (node, `src/**/*.test.ts`) and `ui` (jsdom, `src/**/*.test.tsx`).

## 1. Domain (unit, `src/domain`)

- **time**: local date and instant round-trip in every zone; a day of 25 hours on 25 Oct 2026 in
  Madrid and none in Mexico City; `weekOf`; working-day helpers.
- **timeline fold**: same timeline for any arrival order, with or without duplicates; two sources
  merge into one milestone and the first reporter's time wins; a later report from the same source
  corrects the time; a skipped milestone is `not_reported` and never gets a time; an unplanned hub
  scan is inserted in time order; a source outside `reporters` cannot confirm a milestone; an AI
  reading is pending until reviewed, a fact once accepted, a note once rejected.
- **stage**: customs gates never move the stage; an import entry lodged before arrival leaves the
  shipment at sea; a late old event cannot move the stage backwards.
- **staleness**: telematics silence at 13 h 59 is fine and at 14 h 01 is stale; a vessel is never
  stale by silence; a delivery expected yesterday is stale only after 10:00 local today.
- **dates and published date**: every branch of §8 of the domain spec, including "the more recently
  issued of operator estimate and approved notice wins", superseded and withdrawn.
- **exceptions**: each type at its boundary; `predicted_delay` does not fire next to a `delay` or an
  open hold; `cutoff_risk` only inside 48 h and only while the prerequisite is unmet; a delivered
  shipment has none; health is the worst open exception.
- **clocks and ranking**: `actBy` per type; queue order by clock, then health, then committed date.
- **playbook**: steps per exception; done-ness derived from the log; `notify_customer` becomes
  `outdated` when the best door day changes and stays done when the operator confirms the same day;
  `waiting` when every step is done and the rule still fires; role capability.
- **customer projection**: no raw payloads, notes, positions, pending readings, exceptions or steps;
  an Estela estimate appears only through an approved notice; never "On time" while an exception is
  open; a confirmed hold reads "on hold"; facts flow without approval.
- **perimeter**: site-scoped, account-scoped and external actors.
- **filters**: each dimension; `this_week` resolved from `now` (Mon–Sun).
- **documents**: `not_yet_due` versus `missing` versus `pending`.

## 2. Operator adapters (table-driven, hand-written payloads)

- every adapter maps each row of its mapping table;
- an unknown status becomes a note; a malformed payload is quarantined and never throws;
- Cierzo wall-clock times are read as Europe/Madrid on both sides of the DST change;
- Cierzo `50` remarks: hold, new delivery date, anything else;
- Eisvogel: `eta` yields an operator estimate; `510` is a position;
- Noray: `ARRI` with `EST` is an estimate and with `ACT` a milestone; laden gate-in at origin and
  laden gate-out at destination; empty moves ignored; transport events carry vessel and voyage, not
  a container;
- Turia report: every `concepto`/`estado` pair; `ETA PENDIENTE` withdraws; an email is handed to the
  text interpreter;
- emitter and adapter round-trip for a sample of canonical events per operator.

## 3. Fixtures integrity

- road, office and customs events fall on working days; no Spanish event on Mon 12 Oct; no
  Riba-roja pickup on Fri 9 Oct;
- container numbers carry valid ISO 6346 check digits;
- references are unique; each plan is ordered in time; sections exist;
- personas see 23, 5, 13, 8 and 5 shipments.

## 4. Application (integration through `createTestEstela`, no React)

- **Golden roster**: for each of the 23 shipments, stage, health, primary exception, operator door
  day, Estela door day (or withheld), customer verdict and published date equal the world spec.
- **Queue**: Marta's attention list at T0 is EST-4128, EST-4134, EST-4131, EST-4116, EST-4012,
  EST-4127, with the clocks and step kinds of the world spec; Iker sees one case, Lucía three.
- **Perimeter**: an out-of-scope id returns `null` in both role APIs; `ask` cannot leak ("order
  12345" asked by Iker is not found, in the same words as an unknown order); a command on an
  out-of-scope shipment is `not_found`; Lucía's `send_document` is `forbidden` with its reason.
- **Demo event A**: fans out to two shipments; EST-4058 becomes At risk (basis declared) with an
  Estela estimate on Fri 16 Oct and a window to Mon 19 Oct; EST-4063 gains no exception; the
  operator's Wed 14 Oct is superseded; the feed notice says 2 affected, 1 needs a notice; Mariana
  sees no verdict claim and a date under review.
- **Notice**: after Marta sends the notice, Mariana sees Delayed, Fri 16 Oct, estimated by Ibón
  logistics and approved by Marta Soler, with the notice on top; the step is done.
- **Demo event B**: the same date now carries operator provenance; health is Delayed; no second
  notice is proposed.
- **Customs hold**: confirming the reading makes Mariana see the hold; rejecting it removes the
  exception and leaves a note; event C is disabled until a corrected invoice was sent; after C the
  shipment has no exception.
- **Demo event D**: EST-4127 is no longer stale.
- **Ask**: the query cases of the world spec, stored as data next to the port
  (`query-interpreter.cases.ts`), run against the interpreter and through `ask`.
- **Drafts**: for every case in the queue and every draftable step, the draft is grounded: every
  date written in the body exists in the fact sheet; the subject names the reference; customer
  drafts never contain "you do not need to do anything" nor fault wording.
- **Estimator invariants**: `earliest <= at <= latest` in local days; steps in time order; never in
  the past; withheld when stale.
- **Persistence**: with an injected storage, appended events survive a new store instance; a second
  instance receives them after a storage notification; an expired session and a version mismatch
  reset; `reset()` clears.

The data-driven cases (queries, grounding, estimator invariants) are written against the **ports**,
so pointing the same runner at a real adapter turns them into the offline evaluation set.

## 5. Components (Testing Library, jsdom)

- the date stamp labels the four provenance kinds differently and never shows a time of day for day
  precision;
- a status pill is identifiable without colour (glyph and text);
- the message drawer sends the edited text, names what approving will change, and is disabled with a
  reason for a role that may not send it;
- the ask bar renders an interpretation as removable chips and shows what was not used;
- the portal verdict never reads "On time" for an in-progress shipment.

## 6. End to end (Playwright, one spec, production build)

The hero flow of the README, as one test with steps: land on the queue as Marta; send demo event A;
open order 12345; review, edit and approve the notice; switch to Mariana and see the verdict and the
signed notice; send event B and see the label flip as Marta; confirm the customs reading, send the
corrected invoice, send event C and see the case leave the queue; run both queries from the brief;
open a shipment URL as a persona outside its perimeter and get "not found".
