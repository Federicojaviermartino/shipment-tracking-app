# Estela — specification, part 0: overview, architecture, tooling

The locked design the implementation started from. It was written after the design proposals and
their reviews, and before any code.

## 1. What we are building

**Estela** is a shipment-visibility tool for a fictional industrial manufacturer (Ibón Fluid Systems).
Thesis, in three sentences:

1. Estela turns scattered operator events into **one timeline per shipment, where every status and
   every date says where it came from**: confirmed by an operator, estimated by an operator, or
   estimated by Estela.
2. **Operations** work a short, ranked queue of cases that need a person, each with its evidence, the
   time left to change the outcome and a proposed next step, instead of scanning a portfolio.
3. **Customers** get the verdict at a glance and hear about a delay from the manufacturer first, in
   plain words that a named person approved.

### The cut

- **Deep:** (a) the operations attention queue and its resolution workspace; (b) the consolidated,
  provenance-typed timeline built from four heterogeneous operator feeds; (c) the proactive-notice
  loop that crosses both roles (estimate → exception → AI draft → human approval → customer alert).
- **Light, one interaction each:** portfolio with natural-language search as editable filter chips;
  daily briefing; documents; scripted live feed; customer portal (read-only, same components).
- **Out, on purpose:** map, open-ended chat assistant, login and user admin, shipment creation,
  KPI dashboards, notification settings, assignment/comments/snooze, mobile layouts, dark mode, i18n of
  the UI, real model calls.

### Non-negotiable trust rules (they drive types, tests and copy)

1. **Never invent.** A status or a date is shown only if an operator reported it, an operator declared
   it, or the model estimated it, and it always carries that provenance. Unknown is rendered as unknown
   ("No estimate yet", "Not reported"), never back-filled.
2. **Four provenance classes, one visual grammar in both roles:** Confirmed (operator fact),
   Operator estimate (operator-declared), Estela estimate (model), Written by AI (text). Plus
   Planned (booking plan; nobody asserted it) and Committed (the date promised to the customer).
3. **Facts flow, predictions wait.** Operator-confirmed facts and operator-declared estimates reach the
   customer automatically. A model prediction reaches a customer only inside a notice that a named
   person approved.
4. **No green lie.** The customer never reads "On time" while Estela internally predicts a miss.
5. **AI proposes, people dispose.** Nothing leaves the building (customer notice, message to an
   operator) without a named approver. AI never writes to the event log.
6. **Deterministic things are not labelled AI.** Counts, holds, staleness and rule-based exceptions
   carry no AI mark; only predictions and generated text do.
7. **Out of perimeter equals not found.** Scoping is enforced in the application gateway, never in
   components.

## 2. Stack (locked)

- Next.js 16.4 App Router, React 19.3, TypeScript strict (`noUncheckedIndexedAccess` on), Tailwind CSS v4.
- TanStack Query v5 over an async, in-browser application gateway. No Route Handlers, no Server
  Actions, no fake API: the brief says frontend-only.
- Zod v4 at the operator boundary (parsing raw payloads). `radix-ui` primitives for dialog/drawer,
  dropdown menu, tabs, tooltip. `lucide-react` for generic icons. `clsx` for class composition.
- Fonts: IBM Plex Sans + IBM Plex Mono through `@fontsource/*` (bundled; no network at build or run).
- Tests: Vitest 5 (two projects: `core` in node for `*.test.ts`, `ui` in jsdom for `*.test.tsx`),
  Testing Library, one Playwright spec.
- Package manager: npm. Node >= 22.12.

Everything above is already installed and configured in the repository. A dependency beyond these
needs a strong reason, stated when it is added.

### Next.js 16.4 notes

- The docs for this exact version ship in `node_modules/next/dist/docs/`, and they are the reference
  for every Next API used. Relevant guides: `01-app/02-guides/single-page-applications.md`,
  `01-app/02-guides/client-side-data-fetching/tanstack-query.md`,
  `01-app/02-guides/keeping-pages-static.md`, `01-app/01-getting-started/03-layouts-and-pages.md`,
  `01-app/01-getting-started/05-server-and-client-components.md`.
- `next.config.ts` has `cacheComponents: true` and `partialPrefetching: true` (scaffold defaults; keep
  them). Consequences: Client Components are prerendered at build time; reading the current time,
  `params`, `searchParams`/`useSearchParams` or browser storage during prerender must happen below a
  `<Suspense>` boundary, otherwise the build fails.
- React 19.3 has `browser()` from `react-dom`: `use(browser('reason'))` inside a Client Component
  suspends during prerender and resolves in the browser. **All domain data lives in the browser**, so
  each role layout renders its data-dependent subtree behind one `<Suspense>` + `use(browser(...))`
  gate; the prerendered HTML is the static frame plus a skeleton. Nothing time-dependent is
  server-rendered, which rules out hydration mismatches.
- Global helper types `LayoutProps<'/route'>` and `PageProps<'/route'>` exist (see the scaffold's
  `src/app/layout.tsx`). `params` is a Promise.
- Tailwind v4 is wired through `@tailwindcss/turbopack` in `next.config.ts` (no PostCSS config).
  Theme tokens live in `src/app/globals.css` under `@theme`.

## 3. Architecture

The prototype runs, in the browser, the domain core that a real backend would run, behind the single
gateway the UI is allowed to call. Hexagonal layout, applied with restraint: plain data, pure
functions, no classes unless an adapter needs state, no DI container, no event bus, no mappers
between identical shapes.

```text
src/
  domain/         pure TypeScript: model, timeline fold, ETA selection, exceptions, playbook, perimeter,
                  customer projection, filters. No framework, no I/O, no Date.now().
  application/    ports (driven), the Estela gateway (driving port) and its implementation (use cases),
                  view types returned to the UI.
  adapters/
    operators/    one anti-corruption adapter per operator: schema (Zod), mapping table, parse(),
                  emitter (canonical -> raw, used only by fixtures), tests.
    memory/       event stores (in-memory and browser), demo/fixed/manual clocks, scripted feed.
    ai-mock/      deterministic stand-ins for the AI ports: ETA estimator, text interpreter for
                  free-text operator messages, digest writer, message drafter, query interpreter.
  fixtures/       the synthetic world: sites, operators, accounts, personas, shipments, lane builders,
                  lane history signals, live feed script. Data only.
  composition/    createEstela(): wires ports to adapters and fixtures. Framework-free, so tests can
                  build the whole core with a fixed clock.
  ui/             React: design-system components, feature components, hooks over the gateway,
                  formatting. Talks to `application` only.
  app/            Next.js routes: thin, compose `ui`.
e2e/              Playwright.
```

**Dependency rule** (enforced by `eslint.config.mjs`):
`domain` ← `application` ← `adapters` ← `composition` ← `ui`/`app`. `fixtures` may import `domain` and
the operator emitters. `ui`/`app` never import `adapters` or `fixtures`. `Date.now()` and
argument-less `new Date()` are banned outside `adapters` and `composition`: time comes from the
`Clock` port (in the UI, from a `useNow()` hook fed by the gateway's clock).

**Source of truth.** An append-only event log (raw operator events kept verbatim + their canonical
translation + internal events such as "notice sent" or "document uploaded"). Every stage, health,
ETA and exception is **derived** from the log by pure functions on every read. There is no `status`
field to get out of sync, and no stored exception tickets.

**Pipeline.** raw payload → operator adapter (parse with Zod, translate with a mapping table; free
text goes through the `TextInterpreter` AI port) → correlate (reference → shipment/leg; vessel events
fan out by vessel + voyage) → dedupe (idempotent key) → append → projections recompute → subscribers
get a `{ shipmentIds }` hint → the UI refetches the affected queries.

**Client state.** Server-like state lives behind the gateway and is cached by TanStack Query (keys
start with the actor id, so switching persona can never show another persona's cache). Filters,
selected case and search text live in the URL. The active persona lives in a React context and
`sessionStorage`. No global client store: the client owns no domain state. Events appended after the
seed are persisted in the browser and shared across tabs (part 3).

**Time.** T0 is a fixed instant, Wed 7 Oct 2026 16:00 in Zaragoza, and the demo clock runs in real
time from it (part 2). `DemoClock` in the app; `FixedClock`/`ManualClock` in tests.

## 4. Conventions

- English everywhere.
- Files: kebab-case; one concept per file; tests colocated as `*.test.ts(x)`.
- Types over classes; discriminated unions with exhaustive `switch` (use a `never` check helper);
  `Instant = number` (epoch ms, UTC); ids are branded or plain strings, be consistent.
- Prefer explicit guards over non-null assertions. No `any`. No `// eslint-disable` without a reason
  comment.
- Comments only for a non-obvious _why_.
- Formatting: Prettier (config in `package.json`, 100 columns). Run `npm run format` before finishing.

## 5. Commands

```text
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck    # next typegen && tsc --noEmit
npm run test         # vitest run (core + ui)
npm run test:e2e     # playwright (builds, then serves on :3100)
npm run build
npm run check        # lint + typecheck + test + build
```
