# Estela: the specification

The design as it was locked before any code existed. It is the outcome of the design proposals and
their two reviews described in the [write-up](../write-up.md), section 5, and every implementation
stage started from it.

| Part                                | Covers                                                                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0. Overview](00-overview.md)       | The thesis, the cut, the trust rules, the stack, the architecture and its dependency rule, conventions.                                                     |
| [1. Domain](10-domain.md)           | Glossary, time, the event log, the fold into a timeline, dates, exceptions, clocks, the playbook, the customer view, perimeter, filters.                    |
| [2. World](20-world.md)             | The demo clock, sites, the four operators and their formats, accounts and personas, the 23 shipments, the hero shipments event by event, the scripted feed. |
| [3. Application](30-application.md) | Ports, the gateway, ingestion, the mock AI adapters, the memory adapters, composition.                                                                      |
| [4. Interface](40-interface.md)     | Direction, tokens, the provenance grammar, components, shell, the five screens, accessibility.                                                              |
| [5. Testing](50-testing.md)         | Where the tests are spent, layer by layer.                                                                                                                  |

## What was edited for publication

The text is the one the build used, with two kinds of edits:

- Sentences addressed to the coding agents were removed: working instructions and local paths.
- Part 0 was written first. It was brought in line with parts 2 and 3 where they had superseded it:
  four operators instead of five, a fixed demo clock, events that survive a reload and reach other
  tabs.

Nothing else was rewritten to match the result. Where the code and this text disagree, the code is
right and the list below says why.

## Where the code departs from the specification

The specification was a starting point, not a contract: part 1 says that a rule that proves wrong
gives way to what is domain-correct. These are the differences that matter.

### Decided during implementation

- **Day precision is stored as 12:00 UTC of the day**, not as an instant in some zone. The value
  then reads as the same calendar date in all four zones, which is what lets a forwarder in Valencia
  report a date in Veracruz.
- **Operator adapters return observations, not facts.** The place is optional (Turia's report names
  none) and is resolved against the plan when the event is logged. Matching is strict: a milestone
  reported at a place outside the plan is an unplanned stop, never a guess.
- **The published date has a fourth kind, `planned`.** When nobody has declared a door date and the
  planned day has not passed, the customer sees the plan, labelled as a plan. The rule as written
  showed "date under review" on five shipments whose date nobody had questioned.
- **The primary exception is the worst one that still needs action**, not simply the worst. A hold
  that is waiting on someone else would otherwise hide a delay nobody has told the customer about.
- **`cutoff_risk` outlives the sent document.** A document that was sent but not acknowledged does
  not make the cut-off safe, so the case waits instead of closing.
- **`subscribe` takes the actor.** A change carries only the shipments inside that actor's
  perimeter, and the operator's words go only to staff. The unscoped signature left that filtering
  to components, against trust rule 7.
- **The AI sentence of the briefing is its own call**, `ops.highlight`, so the computed counts never
  wait on a model.
- **`send_notice` carries the day the approver was shown.** If the best date has moved since, the
  command is refused as outdated. A notice whose text mentions a date that is not in its facts is
  refused too, in the gateway and not only in the form.
- **Steps that rest on an unconfirmed AI reading are disabled** until a person reviews the reading.
  A notice could otherwise tell the customer about a hold the portal itself refuses to show.
- **Projections and estimates are cached per log version and per minute of the clock**, not per log
  version alone: staleness, cut-offs and "never in the past" read the clock.
- **Tests compose the core with `ManualClock`.** The multi-step stories need time to pass between
  steps; `FixedClock` was dropped.
- **A sixth persona signs in for the subsidiary.** Part 2 lists five personas and gives Ibón
  Deutschland shipments but nobody to see them. The brief names the subsidiary as a self-service
  user, so Jonas Weber gets the same portal as a customer, over that account.
- **The active persona lives in a module-level store** read with `useSyncExternalStore`, not in a
  React context. Next.js keeps a hidden layout mounted with its state, and the end-to-end test
  caught the persona of one role layout leaking into the other.

### Changed by the review

- **A hold names the document it needs.** The specification treated every customs hold as a wrong
  invoice.
- **A failing estimator fails closed.** The estimate is withheld with its reason; the shipment does
  not turn green.
- **A door date that has already been missed is neither the best date nor the published one.**
- **The customer verdict is "in progress", not "on time", while the date is under review.**
- **A cut-off that passes with the release still ahead keeps its case open**, on the missed
  deadline, instead of disappearing.
