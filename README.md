# Estela: shipment visibility

A clickable frontend prototype for the Shipment Tracking App technical test. An industrial
manufacturer ships from three sites, by road and by sea, through four logistics operators that each
report in their own format. Estela folds those feeds into **one timeline per shipment, where every
status and every date says where it came from**, and builds two views on it:

- **Operations** work a short queue of cases that need a person, ranked by the deadline that still
  changes the outcome, each with its evidence and a proposed next step.
- **Customers** get a verdict at a glance and hear about a delay from the manufacturer first, in
  words a named person approved.

Everything is mocked and runs in the browser: no backend, no database, synthetic data only. The
reasoning behind the cut, the AI features and the architecture is in
[`docs/write-up.md`](docs/write-up.md).

## Run it

Requires Node.js 22.12 or later.

```bash
npm install
npm run dev        # http://localhost:3000
```

The demo world is frozen on **Wednesday 7 October 2026, 16:00 in Zaragoza** and runs in real time from
there. State lives in the browser and is shared across tabs; **Reset** in the demo bar restores it.

## The demo in eight steps

The dark bar at the bottom is demo tooling, outside the product: it switches persona, sends scripted
operator events and resets the world.

1. **Land on the queue** as Marta Soler (logistics lead, all sites). The briefing counts six cases;
   one sentence, marked `AI`, says where acting today changes the outcome. The table is ranked by
   clock, not by severity.
2. **Send the first operator event** from the demo bar: _Noray Lines · NORAY ALTAIR delayed at
   Veracruz_. One vessel event reaches two shipments; only order 12345 breaks its committed date and
   enters the queue as _At risk_.
3. **Open EST-4058** (order 12345). Three operators, one timeline; every event opens to its original
   payload. The _Delivery_ block shows three dates side by side: committed, the operator's estimate
   (now struck through: it was declared before the vessel delay) and Estela's estimate with its chain
   of steps. _Customer currently sees_ makes no claim: no green lie.
4. **Review notice**: the draft is written from the fact sheet. Edit a sentence, try typing a date
   that is not in the record, then **Approve and send**.
5. **Switch to Mariana Olvera** (customer, Aquabajío). Only her eight shipments; the signed notice on
   top; order 12345 reads _Delayed, Fri 16 Oct, estimated by Ibón logistics_. Open it in a second
   window next to operations to watch changes arrive live.
6. **Send the next event**: _Turia Global Forwarding · confirms the new delivery date_. Back as
   Marta, the same date now reads _Operator estimate_ and no second notice is proposed.
7. **Open EST-4012**, held at customs. The hold was read by AI from a forwarder's email in Spanish:
   read the original, **Confirm reading**, then **Send invoice** to the broker. The case waits on
   customs; send _Turia Global Forwarding · customs release, EST-4012_ and it leaves the queue.
8. **Ask**, in the top bar: `shipments to France this week running late` (editable filter chips) and
   `what's going on with order 12345?` (a status line with provenance). Then switch to Iker Zabala on
   a shipment that is not from his site: it does not exist for him.

Also worth a look: `how much duty did we pay on order 48190?` (an honest refusal), EST-4127 (stale:
the estimate is withheld, with the reason), and Lucía Ferrer, whose role may notify customers but not
send documents.

## What is where

```text
src/
  domain/        Pure TypeScript. The model, the fold from events to a timeline, stage, the three
                 dates and the published one, staleness, exceptions and clocks, the playbook, the
                 customer projection, perimeter, filters. No framework, no I/O, no clock.
  application/   Ports and the Estela gateway: the only thing the UI calls. Ingestion, commands,
                 view types, and the deterministic text of every sentence on screen.
  adapters/
    operators/   One anti-corruption adapter per operator: schema, mapping table, parser.
    memory/      Event log (persisted and broadcast across tabs), clocks, the scripted demo feed.
    ai-mock/     Deterministic stand-ins for the five AI ports.
  fixtures/      The synthetic world: 3 sites, 4 operators, 5 accounts, 23 shipments, 4 demo events.
  composition/   The one place where ports meet adapters. Framework-free.
  ui/            Design system (kit), shell and the screens. Talks to `application` only.
  app/           Next.js routes: thin.
e2e/             One Playwright spec: the demo flow.
```

The dependency rule (`domain ← application ← adapters ← composition ← ui`) and a ban on reading the
wall clock outside the clock adapter are enforced by ESLint (`eslint.config.mjs`), not by convention.

| Operator                            | Feed                                                         | Read by                                             |
| ----------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| Transportes Cierzo (road, Spain)    | CSV rows in Spanish, wall-clock times without zone           | mapping table                                       |
| Eisvogel Spedition (road, EU)       | JSON webhook with German keys, telematics positions          | mapping table                                       |
| Noray Lines (ocean)                 | DCSA-style events; vessel events fan out to every box aboard | mapping table                                       |
| Turia Global Forwarding (forwarder) | daily status report rows                                     | mapping table                                       |
|                                     | free-text emails                                             | the text-interpreter AI port, confirmed by a person |

## Checks

```bash
npm run lint
npm run typecheck
npm run test          # unit and integration, on a fixed clock
npm run test:e2e      # builds, serves on :3100 and runs the demo flow (first: npx playwright install chromium)
npm run check         # lint + typecheck + test + build
```

Tests are spent where a wrong answer would mislead a user: the fold (any arrival order, duplicates, no
back-fill), a golden test that derives the state of all 23 shipments from raw operator payloads, the
perimeter (search cannot leak), every adapter's mapping table, the estimator's rules, and the query
cases, which are stored as data next to the port so that they double as an evaluation set.

## Stack

Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, TanStack Query, Zod at the
operator boundary, Radix primitives, Vitest, Testing Library and Playwright. Fonts are bundled: nothing
is fetched at build or run time.
